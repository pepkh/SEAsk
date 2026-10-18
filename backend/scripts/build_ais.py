"""Build the AIS vessel traffic of a recorded day in Neon (`ais_vessels`, `ais_positions`).

Source: the AIS receiver of Ocean Networks Canada at Iona (location IONA, device category
AISRECEIVER). ONC publishes it only as one raw file per UTC day, so the local day
(America/Vancouver, 07:00Z to 07:00Z) spans two files. They are downloaded with the `onc` package
into backend/data/ais/ (skipped when already there). Each line is the ONC receive time and one NMEA
sentence: `20260817T000000.199Z !AIVDM,1,1,,B,14eHUShP1to=PF4LAOIoggv02400,0*22`.

Decoding (pyais): position reports (types 1, 2, 3, 18, 19, 27) and static data (5, 19, 24);
multi-part messages are put back together by (sequence id, channel). Positions keep the ONC receive
time and are cleaned:
- not-available values dropped (lat 91, lon 181, speed 102.3, course 360, heading 511);
- inside the bridge box (BRIDGE_BBOX, 48.55-49.35 N, 123.75-122.85 W) and the local day only;
- fixes that need more than MAX_JUMP_KN from the vessel's previous fix dropped;
- the last fix per minute per vessel, and one fix per 10 minutes while a vessel stays put
  (under 0.5 kn and within 30 m).
Static data: the latest non-empty value per vessel of each field over both files. Ship types are
grouped (passenger, cargo, tanker, ...).

Roles: `own` is our ferry (ONC TWSB), the AIS vessel whose fixes are within 200 m (median) of the
Neon `readings` track over at least 100 shared minutes; `twdp` is the second ONC ferry
(Tsawwassen - Duke Point), matched the same way to the ONC TWDP.N1 NAV track of the day.

Writes, in one transaction: `ais_vessels` (upsert of the day's vessels) and `ais_positions` (the
day's rows replaced). Neon `readings` is only read.

Run from backend/:  .venv/bin/python scripts/build_ais.py --peek       (first lines, then exit)
                    .venv/bin/python scripts/build_ais.py [--date 2026-08-17] [--dry-run]
Needs NEON_URL and ONC_TOKEN in backend/.env.
"""

import argparse
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from onc import ONC
from pyais import decode
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_derived import copy_frame
from export_sample_data import BACKEND, EARTH_RADIUS_M

from app.config import get_settings
from app.frames import day_bounds
from app.times import iso_utc
from db import get_engine

AIS_DIR = BACKEND / "data/ais"
AIS_LOCATION = "IONA"
AIS_CATEGORY = "AISRECEIVER"
TWDP_NAV_LOCATION = "TWDP.N1"
DEFAULT_DAY = date(2026, 8, 17)

LINE_TS = re.compile(r"^(\d{8})T(\d{2})(\d{2})(\d{2}\.\d{3})Z ")
# First character of the 6-bit payload -> message type ('1' = 1 ... 'B' = 18, 'C' = 19, 'H' = 24).
POSITION_TYPES = {1, 2, 3, 18, 19, 27}
STATIC_TYPES = {5, 19, 24}
WANTED_TYPES = POSITION_TYPES | STATIC_TYPES
CLASS_B_TYPES = {18, 19, 24}

KN_PER_MS = 3600 / 1852
MAX_JUMP_KN = 60.0
JUMP_MIN_M = 100.0  # shorter moves are GPS jitter, never a jump
JUMP_RESET = 3  # this many consistent rejected fixes in a row: the vessel did move, accept them
STATIONARY_KN = 0.5
STATIONARY_M = 30.0
STATIONARY_EVERY_S = 600
# Role matching: AIS fixes against a reference track (1-minute positions).
MATCH_MAX_M = 200.0
MATCH_MIN_MINUTES = 100
MATCH_MAX_GAP_S = 180

# AIS ship type (first digit or exact code) -> group. The order of GROUPS is the payload's.
GROUPS = ("passenger", "cargo", "tanker", "tug", "fishing", "pleasure", "sailing", "hsc", "special", "other", "unknown")


def type_group(ship_type: int | None) -> str:
    if ship_type is None or ship_type == 0:
        return "unknown"
    if ship_type == 30:
        return "fishing"
    if ship_type in (31, 32, 52):
        return "tug"
    if ship_type == 36:
        return "sailing"
    if ship_type == 37:
        return "pleasure"
    if 40 <= ship_type <= 49:
        return "hsc"
    if ship_type in (50, 51, 53, 55):
        return "special"
    if 60 <= ship_type <= 69:
        return "passenger"
    if 70 <= ship_type <= 79:
        return "cargo"
    if 80 <= ship_type <= 89:
        return "tanker"
    return "other"


DDL = """
create table if not exists ais_vessels (
  mmsi integer primary key,
  name text,
  callsign text,
  imo integer,
  ship_type smallint,
  type_group text not null,
  ais_class char(1),
  length_m real,
  beam_m real,
  destination text,
  role text
);
comment on table ais_vessels is 'Vessels seen by the ONC Iona AIS receiver (static AIS data, latest value). Built by backend/scripts/build_ais.py.';
comment on column ais_vessels.type_group is 'passenger, cargo, tanker, tug, fishing, pleasure, sailing, hsc, special, other or unknown (from ship_type).';
comment on column ais_vessels.role is 'own = our ferry (ONC TWSB, matched to readings), twdp = the ONC Tsawwassen - Duke Point ferry, else null.';
create table if not exists ais_positions (
  mmsi integer not null references ais_vessels (mmsi),
  ts timestamptz not null,
  lat double precision not null,
  lon double precision not null,
  sog_kn real,
  cog_deg real,
  heading_deg smallint,
  nav_status smallint,
  primary key (mmsi, ts)
);
create index if not exists ais_positions_ts_idx on ais_positions (ts);
comment on table ais_positions is 'AIS fixes in the bridge box (ONC Iona receiver time): the last per minute per vessel, one per 10 min while stationary. Built by backend/scripts/build_ais.py.';
"""

VESSEL_COLUMNS = ["mmsi", "name", "callsign", "imo", "ship_type", "type_group", "ais_class", "length_m", "beam_m", "destination", "role"]
POSITION_COLUMNS = ["mmsi", "ts", "lat", "lon", "sog_kn", "cog_deg", "heading_deg", "nav_status"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--date", type=date.fromisoformat, default=DEFAULT_DAY, help="Local date, YYYY-MM-DD.")
    parser.add_argument("--peek", action="store_true", help="Download, print the first lines of each file and the timestamp format, then exit.")
    parser.add_argument("--dry-run", action="store_true", help="Print the summary, write nothing.")
    args = parser.parse_args()
    started = time.monotonic()

    start, end = day_bounds(args.date)
    paths = download(start, end)
    if args.peek:
        peek(paths)
        return
    for path in paths:
        check_timestamps(path)

    bbox = get_settings().bridge_bbox
    decoded = read_files(paths, start.timestamp(), end.timestamp(), bbox)
    fixes = clean_positions(decoded["positions"])
    minute = fixes.attrs["minute"]
    vessels = build_vessels(decoded["static"], fixes)

    own = match_role("own (Neon readings)", minute, own_track(start, end))
    twdp = match_role(f"twdp (ONC {TWDP_NAV_LOCATION})", minute, twdp_track(start, end), exclude={own} if own else set())
    if own:
        vessels.loc[vessels["mmsi"] == own, "role"] = "own"
    if twdp:
        vessels.loc[vessels["mmsi"] == twdp, "role"] = "twdp"

    describe(decoded, fixes, vessels, start, end)
    print(f"Runtime {time.monotonic() - started:.0f} s")
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(vessels, fixes, start, end)


# --- Files


def onc_client(timeout: int = 600) -> ONC:
    settings = get_settings()
    if not settings.onc_token:
        sys.exit("ONC_TOKEN is not set in backend/.env.")
    return ONC(settings.onc_token, showInfo=False, showWarning=False, outPath=str(AIS_DIR), timeout=timeout)


def download(start: datetime, end: datetime) -> list[Path]:
    """The daily files that overlap [start, end), downloaded unless already on disk."""
    onc = onc_client()
    listing = onc.getArchivefileByLocation(
        {
            "locationCode": AIS_LOCATION,
            "deviceCategoryCode": AIS_CATEGORY,
            "dateFrom": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "dateTo": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "returnOptions": "all",
        }
    )
    files = sorted(f["filename"] for f in listing.get("files") or [] if f["filename"].endswith(".txt"))
    if not files:
        sys.exit(f"No {AIS_LOCATION} {AIS_CATEGORY} .txt files between {iso_utc(start)} and {iso_utc(end)}.")
    AIS_DIR.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in files:
        path = AIS_DIR / name
        if not path.exists() or path.stat().st_size == 0:
            print(f"Downloading {name} ...", flush=True)
            error = onc.downloadArchivefile(name)
            if error or not path.exists():
                sys.exit(f"Download of {name} failed: {error}")
        paths.append(path)
    return paths


def peek(paths: list[Path], lines: int = 12) -> None:
    for path in paths:
        print(f"== {path.name} ({path.stat().st_size / 1e6:.1f} MB)")
        with path.open(errors="replace") as f:
            for i, line in enumerate(f):
                if i >= lines:
                    break
                print("  " + line.rstrip("\n"))
        check_timestamps(path)


def check_timestamps(path: Path, sample: int = 200) -> None:
    """Abort unless every sampled line starts with the ONC receive time (YYYYMMDDTHHMMSS.fffZ)."""
    with path.open(errors="replace") as f:
        head = [line for _, line in zip(range(sample), f) if line.strip()]
    stamped = sum(1 for line in head if LINE_TS.match(line))
    if stamped < len(head):
        sys.exit(f"{path.name}: {len(head) - stamped} of {len(head)} lines have no ONC timestamp prefix; cannot place them in time.")
    print(f"{path.name}: per-line timestamp = ONC receive time `YYYYMMDDTHHMMSS.fffZ` + space + NMEA sentence ({stamped}/{len(head)} lines checked)")


# --- Decoding


def payload_type(payload: str) -> int:
    """AIS message type from the first 6-bit character of the payload."""
    if not payload:
        return -1
    v = ord(payload[0]) - 48
    return v - 8 if v > 40 else v


def read_files(paths: list[Path], t0: float, t1: float, bbox: tuple[float, float, float, float]) -> dict:
    """Decode the files: positions in [t0, t1) inside the box, static data from every line."""
    south, north, west, east = bbox
    stats = Counter()
    by_type = Counter()
    pos = defaultdict(list)
    static: dict[int, dict] = {}
    day_epoch: dict[str, float] = {}
    pending: dict[tuple[str, str], tuple[float, list[str]]] = {}

    def epoch(m: re.Match) -> float:
        d = m.group(1)
        if d not in day_epoch:
            day_epoch[d] = datetime.strptime(d, "%Y%m%d").replace(tzinfo=timezone.utc).timestamp()
        return day_epoch[d] + int(m.group(2)) * 3600 + int(m.group(3)) * 60 + float(m.group(4))

    def handle(t: float, sentences: list[str], msg_type: int) -> None:
        try:
            msg = decode(*sentences)
        except Exception:  # noqa: BLE001 - pyais raises several error types for bad payloads
            stats["decode_errors"] += 1
            return
        stats["decoded"] += 1
        mmsi = int(msg.mmsi)
        if msg_type in STATIC_TYPES:
            add_static(static, mmsi, msg, msg_type, t)
        if msg_type in POSITION_TYPES and t0 <= t < t1:
            stats["day_positions"] += 1
            fix = position(msg, msg_type)
            if fix is None:
                stats["invalid_positions"] += 1
                return
            lat, lon = fix[0], fix[1]
            if not (south <= lat <= north and west <= lon <= east):
                stats["outside_box"] += 1
                return
            pos["mmsi"].append(mmsi)
            pos["t"].append(t)
            for key, value in zip(("lat", "lon", "sog", "cog", "hdg", "nav"), fix):
                pos[key].append(value)
            pos["type"].append(msg_type)

    for path in paths:
        with path.open(errors="replace") as f:
            for line in f:
                stats["lines"] += 1
                m = LINE_TS.match(line)
                if not m:
                    stats["no_timestamp"] += 1
                    continue
                sentence = line[m.end():].strip()
                fields = sentence.split(",")
                if len(fields) < 7 or not fields[0].endswith(("VDM", "VDO")):
                    stats["not_ais"] += 1
                    continue
                count, num, seq, channel, payload = fields[1], fields[2], fields[3], fields[4], fields[5]
                if not (count.isdigit() and num.isdigit()):
                    stats["malformed"] += 1
                    continue
                if count == "1":
                    msg_type = payload_type(payload)
                    by_type[msg_type] += 1
                    if msg_type in WANTED_TYPES:
                        handle(epoch(m), [sentence], msg_type)
                    continue
                key = (seq, channel)
                if num == "1":
                    if key in pending:
                        stats["incomplete_multipart"] += 1
                    pending[key] = (epoch(m), [sentence])
                    continue
                if key not in pending or len(pending[key][1]) != int(num) - 1:
                    stats["orphan_fragments"] += 1
                    continue
                pending[key][1].append(sentence)
                if num == count:
                    t, parts = pending.pop(key)
                    msg_type = payload_type(parts[0].split(",")[5])
                    by_type[msg_type] += 1
                    if msg_type in WANTED_TYPES:
                        handle(t, parts, msg_type)
    stats["incomplete_multipart"] += len(pending)
    return {"stats": stats, "by_type": by_type, "positions": pd.DataFrame(pos), "static": static}


def position(msg, msg_type: int) -> tuple | None:
    """(lat, lon, sog_kn, cog_deg, heading_deg, nav_status) with not-available values as None, or
    None when the position itself is not available."""
    lat, lon = msg.lat, msg.lon
    if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:  # 91 / 181 = not available
        return None
    speed, course = msg.speed, msg.course
    if msg_type == 27:  # long-range: whole knots (63 = n/a) and degrees (511 = n/a)
        sog = None if speed is None or speed >= 63 else float(speed)
        cog = None if course is None or course >= 360 else float(course)
        heading = None
    else:
        sog = None if speed is None or speed >= 102.2 else float(speed)  # 102.3 = n/a
        cog = None if course is None or course >= 360 else float(course)
        heading = None if msg.heading is None or msg.heading > 359 else int(msg.heading)
    status = getattr(msg, "status", None)
    nav = int(status) if status is not None and msg_type in (1, 2, 3, 27) else None
    return float(lat), float(lon), sog, cog, heading, nav


def clean_text(value) -> str | None:
    if value is None:
        return None
    s = str(value).replace("@", " ").strip()
    s = " ".join(s.split())
    return s or None


def positive(value) -> int | None:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def add_static(static: dict, mmsi: int, msg, msg_type: int, t: float) -> None:
    """Keep the latest non-empty value of each static field."""
    rec = static.setdefault(mmsi, {"classes": Counter()})
    rec["classes"]["B" if msg_type in CLASS_B_TYPES else "A"] += 1
    fields: dict = {}
    if msg_type in (5, 19) or (msg_type == 24 and getattr(msg, "partno", None) == 0):
        fields["name"] = clean_text(getattr(msg, "shipname", None))
    if msg_type in (5, 19) or (msg_type == 24 and getattr(msg, "partno", None) == 1):
        fields["ship_type"] = positive(getattr(msg, "ship_type", None))
        if msg_type != 19:
            fields["callsign"] = clean_text(getattr(msg, "callsign", None))
        if not str(mmsi).startswith("98"):  # auxiliary craft send the mothership MMSI instead
            bow, stern = positive(getattr(msg, "to_bow", None)), positive(getattr(msg, "to_stern", None))
            port, starboard = positive(getattr(msg, "to_port", None)), positive(getattr(msg, "to_starboard", None))
            if bow and stern:
                fields["length_m"] = float(bow + stern)
            if port and starboard:
                fields["beam_m"] = float(port + starboard)
    if msg_type == 5:
        fields["imo"] = positive(getattr(msg, "imo", None))
        fields["destination"] = clean_text(getattr(msg, "destination", None))
    for key, value in fields.items():
        if value is not None:
            rec[key] = value
    rec["t"] = t


# --- Positions


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(h))


def dist_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, h)))


def jump_keep(t: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """False for fixes that would need more than MAX_JUMP_KN from the last accepted fix. A run of
    JUMP_RESET rejected fixes that agree with each other is accepted (the earlier track was off)."""
    keep = np.ones(len(t), dtype=bool)
    last = 0
    chain: list[int] = []

    def too_fast(a: int, b: int) -> bool:
        d = dist_m(lat[a], lon[a], lat[b], lon[b])
        return d > JUMP_MIN_M and d / max(t[b] - t[a], 1.0) * KN_PER_MS > MAX_JUMP_KN

    for i in range(1, len(t)):
        if not too_fast(last, i):
            last, chain = i, []
            continue
        keep[i] = False
        chain = chain + [i] if chain and not too_fast(chain[-1], i) else [i]
        if len(chain) >= JUMP_RESET:
            keep[chain] = True
            last, chain = i, []
    return keep


def thin_stationary(t: np.ndarray, lat: np.ndarray, lon: np.ndarray, sog: np.ndarray) -> np.ndarray:
    """One fix per STATIONARY_EVERY_S while the vessel stays within STATIONARY_M of the last kept fix
    at under STATIONARY_KN (an unknown speed counts as stationary). The last fix is always kept."""
    keep = np.ones(len(t), dtype=bool)
    last = 0
    for i in range(1, len(t)):
        slow = not (sog[i] >= STATIONARY_KN)  # NaN -> slow
        if slow and t[i] - t[last] < STATIONARY_EVERY_S and dist_m(lat[last], lon[last], lat[i], lon[i]) < STATIONARY_M:
            keep[i] = False
        else:
            last = i
    if len(t):
        keep[-1] = True
    return keep


def clean_positions(raw: pd.DataFrame) -> pd.DataFrame:
    """Jump filter, last fix per minute (a precise report wins over a type 27 one), stationary
    thinning. `attrs['minute']` keeps the per-minute fixes before thinning (for role matching)."""
    df = raw.sort_values(["mmsi", "t"], kind="stable").reset_index(drop=True)
    counts = {"in_box": len(df)}
    keep = np.zeros(len(df), dtype=bool)
    for _, idx in df.groupby("mmsi").indices.items():
        keep[idx] = jump_keep(df["t"].to_numpy()[idx], df["lat"].to_numpy()[idx], df["lon"].to_numpy()[idx])
    counts["jumps_dropped"] = int((~keep).sum())
    df = df[keep]

    df = df.assign(minute=(df["t"] // 60).astype(np.int64), precise=(df["type"] != 27).astype(int))
    df = df.sort_values(["mmsi", "minute", "precise", "t"]).drop_duplicates(["mmsi", "minute"], keep="last")
    df = df.sort_values(["mmsi", "t"]).reset_index(drop=True)
    counts["per_minute"] = len(df)
    minute = df.copy()

    keep = np.zeros(len(df), dtype=bool)
    sog = df["sog"].astype(float).to_numpy()
    for _, idx in df.groupby("mmsi").indices.items():
        keep[idx] = thin_stationary(df["t"].to_numpy()[idx], df["lat"].to_numpy()[idx], df["lon"].to_numpy()[idx], sog[idx])
    df = df[keep].reset_index(drop=True)
    counts["kept"] = len(df)
    df.attrs["counts"] = counts
    df.attrs["minute"] = minute
    return df


# --- Vessels


def build_vessels(static: dict, fixes: pd.DataFrame) -> pd.DataFrame:
    """One row per vessel with fixes in the day."""
    pos_class = fixes.assign(cls=np.where(fixes["type"].isin(list(CLASS_B_TYPES)), "B", "A")).groupby("mmsi")["cls"].agg(lambda s: s.mode().iat[0])
    rows = []
    for mmsi in sorted(fixes["mmsi"].unique()):
        rec = static.get(int(mmsi), {})
        cls = pos_class.get(mmsi) or (rec["classes"].most_common(1)[0][0] if rec.get("classes") else None)
        ship_type = rec.get("ship_type")
        rows.append(
            {
                "mmsi": int(mmsi),
                "name": rec.get("name"),
                "callsign": rec.get("callsign"),
                "imo": rec.get("imo"),
                "ship_type": ship_type,
                "type_group": type_group(ship_type),
                "ais_class": cls,
                "length_m": rec.get("length_m"),
                "beam_m": rec.get("beam_m"),
                "destination": rec.get("destination"),
                "role": None,
            }
        )
    out = pd.DataFrame(rows, columns=VESSEL_COLUMNS)
    for col in ("imo", "ship_type"):
        out[col] = out[col].astype("Int64")
    return out


# --- Roles


def epoch_s(values) -> np.ndarray:
    """Unix seconds of datetimes, whatever their pandas resolution (us or ns)."""
    return np.asarray((pd.to_datetime(values, utc=True) - pd.Timestamp(0, tz="UTC")) / pd.Timedelta(seconds=1), dtype=float)


def own_track(start: datetime, end: datetime) -> pd.DataFrame:
    """Our ferry: the first Neon `readings` position of each minute."""
    with get_engine().connect() as conn:
        conn.execute(text("set transaction read only"))
        df = pd.read_sql(
            text(
                "select distinct on (date_trunc('minute', ts)) ts, latitude as lat, longitude as lon from readings "
                "where ts >= :start and ts < :end and latitude is not null and longitude is not null "
                "order by date_trunc('minute', ts), ts"
            ),
            conn,
            params={"start": start, "end": end},
        )
    df["t"] = epoch_s(df["ts"])
    return df[["t", "lat", "lon"]]


def twdp_track(start: datetime, end: datetime) -> pd.DataFrame:
    """The Tsawwassen - Duke Point ferry: ONC TWDP.N1 NAV, one-minute averages (sample time = the
    middle of the minute)."""
    onc = onc_client(timeout=300)
    response = onc.getScalardataByLocation(
        {
            "locationCode": TWDP_NAV_LOCATION,
            "deviceCategoryCode": "NAV",
            "propertyCode": "latitude,longitude",
            "dateFrom": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "dateTo": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "resampleType": "avg",
            "resamplePeriod": 60,
            "qualityControl": "clean",
            "rowLimit": 100000,
        },
        allPages=True,
    )
    cols = {}
    for sensor in response.get("sensorData") or []:
        if sensor["propertyCode"] in ("latitude", "longitude") and sensor["propertyCode"] not in cols:
            data = sensor["data"]
            cols[sensor["propertyCode"]] = pd.Series(
                pd.to_numeric(pd.Series(data["values"], dtype="object"), errors="coerce").astype(float).to_numpy(),
                index=pd.to_datetime(data["sampleTimes"], utc=True),
            )
    if len(cols) < 2:
        return pd.DataFrame(columns=["t", "lat", "lon"])
    df = pd.DataFrame({"lat": cols["latitude"], "lon": cols["longitude"]}).dropna()
    df["t"] = epoch_s(df.index)
    return df.reset_index(drop=True)[["t", "lat", "lon"]]


def match_role(label: str, minute: pd.DataFrame, track: pd.DataFrame, exclude: set | None = None) -> int | None:
    """The MMSI whose per-minute fixes follow `track` (median distance under MATCH_MAX_M over at
    least MATCH_MIN_MINUTES shared minutes), or None."""
    if track.empty:
        print(f"Role {label}: no reference track")
        return None
    rt, rlat, rlon = track["t"].to_numpy(), track["lat"].to_numpy(), track["lon"].to_numpy()
    t = minute["t"].to_numpy()
    j = np.searchsorted(rt, t)
    ok = (j > 0) & (j < len(rt))
    jj = np.clip(j, 1, len(rt) - 1)
    t_a, t_b = rt[jj - 1], rt[jj]
    ok &= (t - t_a <= MATCH_MAX_GAP_S) & (t_b - t <= MATCH_MAX_GAP_S)
    lat_i = np.interp(t, rt, rlat)
    lon_i = np.interp(t, rt, rlon)
    d = haversine_m(minute["lat"].to_numpy(), minute["lon"].to_numpy(), lat_i, lon_i)
    cand = pd.DataFrame({"mmsi": minute["mmsi"].to_numpy(), "d": d})[ok]
    scores = cand.groupby("mmsi")["d"].agg(minutes="size", median="median").reset_index()
    scores = scores[scores["minutes"] >= MATCH_MIN_MINUTES].sort_values("median")
    if exclude:
        scores = scores[~scores["mmsi"].isin(list(exclude))]
    best = scores.head(3)
    print(f"Role {label}: reference {len(track)} minutes; best candidates (mmsi, shared minutes, median m):",
          ", ".join(f"{int(r.mmsi)} {int(r.minutes)} {r.median:.0f}" for r in best.itertuples()) or "none")
    if best.empty or best.iloc[0]["median"] >= MATCH_MAX_M:
        return None
    return int(best.iloc[0]["mmsi"])


# --- Output


def positions_frame(fixes: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(
        {
            "mmsi": fixes["mmsi"].astype(int),
            "ts": pd.to_datetime((fixes["t"] * 1000).round().astype("int64"), unit="ms", utc=True),
            "lat": fixes["lat"].round(6),
            "lon": fixes["lon"].round(6),
            "sog_kn": fixes["sog"].astype(float).round(1),
            "cog_deg": fixes["cog"].astype(float).round(1),
            "heading_deg": fixes["hdg"].astype("Int64"),
            "nav_status": fixes["nav"].astype("Int64"),
        }
    )
    return out.drop_duplicates(["mmsi", "ts"], keep="last")


def write(vessels: pd.DataFrame, fixes: pd.DataFrame, start: datetime, end: datetime) -> None:
    positions = positions_frame(fixes)
    updates = ", ".join(f"{c} = excluded.{c}" for c in VESSEL_COLUMNS if c != "mmsi")
    with get_engine().begin() as conn:
        conn.execute(text(DDL))
        conn.execute(text("create temporary table ais_vessels_load (like ais_vessels) on commit drop"))
        cursor = conn.connection.driver_connection.cursor()
        copy_frame(cursor, "ais_vessels_load", vessels[VESSEL_COLUMNS])
        conn.execute(text(f"insert into ais_vessels select * from ais_vessels_load on conflict (mmsi) do update set {updates}"))
        deleted = conn.execute(text("delete from ais_positions where ts >= :start and ts < :end"), {"start": start, "end": end}).rowcount
        copy_frame(cursor, "ais_positions", positions[POSITION_COLUMNS])
    print(f"Wrote ais_vessels ({len(vessels)} upserted) and ais_positions ({len(positions)} rows, replaced {deleted}) for {iso_utc(start)} - {iso_utc(end)}")


def describe(decoded: dict, fixes: pd.DataFrame, vessels: pd.DataFrame, start: datetime, end: datetime) -> None:
    s = decoded["stats"]
    print(f"Local day {iso_utc(start)} - {iso_utc(end)}")
    print(
        f"Lines {s['lines']}, decoded {s['decoded']} (types {sorted(WANTED_TYPES)}), decode errors {s['decode_errors']}, "
        f"orphan fragments {s['orphan_fragments']}, incomplete multipart {s['incomplete_multipart']}, not AIS {s['not_ais']}, malformed {s['malformed']}"
    )
    print("Messages by type (all sentences, both files):", dict(sorted(decoded["by_type"].items())))
    c = fixes.attrs["counts"]
    print(
        f"Position reports in the day {s['day_positions']}: not available {s['invalid_positions']}, outside box {s['outside_box']}, "
        f"in box {c['in_box']}, jumps dropped {c['jumps_dropped']}, per minute {c['per_minute']}, after stationary thinning {c['kept']}"
    )
    print(f"MMSIs: {len(vessels)} with fixes in the day ({len(decoded['static'])} with static data in the files); "
          f"named {vessels['name'].notna().sum()}, typed {vessels['ship_type'].notna().sum()}, class {vessels['ais_class'].value_counts().to_dict()}")
    merged = fixes.merge(vessels[["mmsi", "type_group"]], on="mmsi")
    by_group = pd.DataFrame({"vessels": vessels["type_group"].value_counts(), "fixes": merged["type_group"].value_counts()}).reindex(GROUPS).fillna(0).astype(int)
    print("By group:\n" + by_group.T.to_string())
    top = fixes["mmsi"].value_counts().head(10).rename("fixes").reset_index().merge(vessels, on="mmsi")
    print("Top 10 vessels by fixes:")
    print(top[["mmsi", "fixes", "name", "ship_type", "type_group", "length_m", "role"]].to_string(index=False))
    for role in ("own", "twdp"):
        v = vessels[vessels["role"] == role]
        if v.empty:
            print(f"Role {role}: not found")
        else:
            r = v.iloc[0]
            print(f"Role {role}: MMSI {r['mmsi']} {r['name']} (type {r['ship_type']}, {r['length_m']} m), {int((fixes['mmsi'] == r['mmsi']).sum())} fixes")


if __name__ == "__main__":
    main()
