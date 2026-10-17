"""Build the derived tables in Neon from the recorded day (2026-08-17).

Reads `readings` and `crossings` (Neon), the ONC QC flags of the ferry's TSG, OXYSENSOR and
TURBCHLFL sensors for the day (`onc` package, location ONC_LOCATION_CODE), the route line
(frontend/src/config/route.json) and the GEBCO 2026 depth grid (see --gebco). Replaces only these,
in one transaction:

- readings_derived: one row per `readings.ts`. Crossing, underway and sampling states, speed in
  knots, route fraction (0 at Swartz Bay, 1 at Tsawwassen) and zone, density, roll variability and
  ride comfort, and one ONC QC flag per sensor group (the flags are the same for every sensor of a
  group). On 2026-08-17 every water value in `readings` has flag 1 (the export already dropped the
  rest), so the flags explain the gaps: 4 = bad (the pump is off at the berth), 3 = probably bad
  (e.g. the TSG from 17:00 to 19:00 local).
- route_profile: water values along the route in BINS equal parts of the route line, per crossing
  (crossing_id 0 = all crossings), with the GEBCO depth under the line. `*_anom` is the bin value
  minus the same crossing's mean over the whole route.
- crossing_stats: one row per crossing.

Also writes frontend/src/mocks/common/route-profile.json (the all-crossings profile, same shape as
GET /route/profile), the kiosk's fallback when the API is down.

Run from backend/:  .venv/bin/python scripts/build_derived.py [--dry-run]
Needs NEON_URL and ONC_TOKEN in backend/.env, and the GEBCO grid from
s3://ocean-hackathon-2026/data/bcferries/bathymetry_salishsea/ in backend/data/.
"""

import argparse
import io
import json
import sys
from pathlib import Path

import gsw
import numpy as np
import pandas as pd
import xarray as xr
from onc import ONC
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_sample_data import BACKEND, FRONTEND, MS_TO_KN, ROUTE_FILE, cumulative_m, point_along

from app.config import get_settings
from db import get_engine

GEBCO_FILE = BACKEND / "data/gebco_2026_n55.0_s45.0_w-130.0_e-120.0.nc"
PROFILE_MOCK = FRONTEND / "src/mocks/common/route-profile.json"

UNDERWAY_MIN_MS = 2.0
BINS = 200
ROLL_WINDOW = "60s"
# Roll standard deviation over ROLL_WINDOW, degrees. On 2026-08-17 underway: below 0.5 for 75% of
# the time, 0.5 to 1 for 20%, above 1 for 5%. frontend/src/ship/comfort.ts uses the same limits.
CALM_MAX_DEG = 0.5
GENTLE_MAX_DEG = 1.0
# ONC QC flags to drop: 3 probably bad, 4 bad, 6 bad down-sampling, 9 missing (as app/sources/onc.py).
QC_DROP = (3, 4, 6, 9)
# ONC device category -> (flag column, readings columns it covers).
QC_GROUPS = {
    "TSG": ("tsg_flag", ("tsg_temperature", "salinity", "conductivity", "sound_speed")),
    "OXYSENSOR": ("oxygen_flag", ("oxygen", "oxygen_corrected", "oxygen_saturation", "oxysensor_temperature")),
    "TURBCHLFL": ("optics_flag", ("chlorophyll", "turbidity", "cdom_fluorescence")),
}
# Profile values: output name -> column of `readings` or `readings_derived`.
PROFILE_VALUES = {
    "sst": "tsg_temperature",
    "salinity": "salinity",
    "o2_sat": "oxygen_saturation",
    "chl": "chlorophyll",
    "turbidity": "turbidity",
    "sigma_t": "sigma_t",
}
ANOMALIES = ("sst", "salinity", "o2_sat")

READINGS_SQL = text(
    "select ts, latitude, longitude, speed_over_ground, roll, systemstatus, valve_position_status, "
    + ", ".join(c for _, cols in QC_GROUPS.values() for c in cols)
    + " from readings order by ts"
)

DERIVED_DDL = """
create table readings_derived (
  ts timestamptz primary key references readings (ts),
  crossing_id smallint references crossings (id),
  is_underway boolean not null,
  is_sampling boolean not null,
  speed_kn real,
  route_fraction real,
  route_km real,
  off_route_m real,
  zone text,
  sigma_t real,
  roll_std_60s real,
  comfort text,
  tsg_flag smallint,
  oxygen_flag smallint,
  optics_flag smallint
);
comment on table readings_derived is 'Per-second derived values for readings. Built by backend/scripts/build_derived.py.';
comment on column readings_derived.route_fraction is 'Position projected onto frontend/src/config/route.json: 0 Swartz Bay, 1 Tsawwassen.';
comment on column readings_derived.sigma_t is 'Seawater density minus 1000, kg/m3, at the surface (TEOS-10 sigma0 from QC-good TSG values).';
comment on column readings_derived.roll_std_60s is 'Standard deviation of roll over the previous 60 s, degrees.';
comment on column readings_derived.comfort is 'calm (roll_std_60s < 0.5), gentle (< 1) or rolly.';
"""

PROFILE_DDL = """
create table route_profile (
  crossing_id smallint not null,
  bin smallint not null,
  fraction real not null,
  km real not null,
  zone text not null,
  lat double precision not null,
  lon double precision not null,
  depth_m real,
  n integer not null,
  speed_kn real,
  sst real, salinity real, o2_sat real, chl real, turbidity real, sigma_t real,
  sst_anom real, salinity_anom real, o2_sat_anom real,
  primary key (crossing_id, bin)
);
comment on table route_profile is 'Underway QC-good water values per route bin; crossing_id 0 = all crossings. Built by backend/scripts/build_derived.py.';
"""

STATS_DDL = """
create table crossing_stats (
  id smallint primary key references crossings (id),
  direction text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  duration_min real not null,
  track_km real not null,
  avg_kn real,
  max_kn real,
  dwell_before_min real,
  active_pass_min real,
  roll_std real,
  max_abs_roll real,
  sst real, salinity real, salinity_min real, salinity_max real, o2_sat real, chl real,
  tsg_missing boolean not null
);
comment on table crossing_stats is 'One row per crossing. Built by backend/scripts/build_derived.py.';
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--gebco", type=Path, default=GEBCO_FILE, help="GEBCO 2026 NetCDF grid.")
    parser.add_argument("--dry-run", action="store_true", help="Print the summaries, write nothing.")
    args = parser.parse_args()
    if not args.gebco.exists():
        sys.exit(f"{args.gebco} not found. Download it from the S3 bathymetry_salishsea folder.")

    with get_engine().connect() as conn:
        conn.execute(text("set transaction read only"))
        crossings = pd.read_sql(text("select id, direction, start_ts, end_ts from crossings order by id"), conn)
        df = pd.read_sql(READINGS_SQL, conn)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    for col in ("start_ts", "end_ts"):
        crossings[col] = pd.to_datetime(crossings[col], utc=True)

    route = json.loads(ROUTE_FILE.read_text())
    line = [tuple(p) for p in route["points"]]
    cumulative = cumulative_m(line)

    add_flags(df, fetch_flags(df["ts"].iloc[0], df["ts"].iloc[-1]))
    add_derived(df, crossings, route, line, cumulative)
    depth = gebco_depth(args.gebco, line, cumulative)
    profile = build_profile(df, crossings, route, line, cumulative, depth)
    stats = build_stats(df, crossings)

    describe(df, profile, stats)
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(df, profile, stats)
    PROFILE_MOCK.write_text(json.dumps(profile_json(profile, 0, None, cumulative[-1]), separators=(",", ":")))
    print(f"Wrote {PROFILE_MOCK.relative_to(BACKEND.parent)} ({PROFILE_MOCK.stat().st_size / 1000:.0f} kB)")


# --- QC flags (ONC)


def fetch_flags(start: pd.Timestamp, end: pd.Timestamp) -> dict[str, pd.DataFrame]:
    """Per sensor group: sample times and the first sensor's QC flags for the day."""
    settings = get_settings()
    if not settings.onc_token:
        sys.exit("ONC_TOKEN is not set in backend/.env.")
    onc = ONC(settings.onc_token, showInfo=False, timeout=180)
    out = {}
    for category, (flag_col, _) in QC_GROUPS.items():
        response = onc.getScalardataByLocation(
            {
                "locationCode": settings.onc_location_code,
                "deviceCategoryCode": category,
                "dateFrom": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "dateTo": (end + pd.Timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "qualityControl": "raw",
                "rowLimit": 100000,
            },
            allPages=True,
        )
        data = response["sensorData"][0]["data"]
        out[flag_col] = pd.DataFrame(
            {"ts": pd.to_datetime(data["sampleTimes"], utc=True), flag_col: data["qaqcFlags"]}
        ).sort_values("ts")
    return out


def add_flags(df: pd.DataFrame, flags: dict[str, pd.DataFrame]) -> None:
    """Nearest ONC sample within 1 s of each reading. Water values with a bad flag are set to null
    (none on 2026-08-17: `describe` prints the count)."""
    keys = df[["ts"]].astype({"ts": "datetime64[us, UTC]"})
    for flag_col, sample in flags.items():
        sample = sample.astype({"ts": "datetime64[us, UTC]"})
        merged = pd.merge_asof(keys, sample, on="ts", direction="nearest", tolerance=pd.Timedelta(seconds=1))
        df[flag_col] = merged[flag_col].astype("Int64").to_numpy()
    for flag_col, cols in QC_GROUPS.values():
        bad = df[flag_col].isin(QC_DROP).fillna(False).to_numpy(dtype=bool)
        df.attrs[flag_col] = int(df.loc[bad, list(cols)].notna().any(axis=1).sum())
        for col in cols:
            df.loc[bad, col] = np.nan


# --- Per-second values


def add_derived(df: pd.DataFrame, crossings: pd.DataFrame, route: dict, line: list, cumulative: list) -> None:
    df["crossing_id"] = pd.array([pd.NA] * len(df), dtype="Int64")
    for c in crossings.itertuples():
        df.loc[df["ts"].between(c.start_ts, c.end_ts), "crossing_id"] = c.id
    df["is_underway"] = df["speed_over_ground"] > UNDERWAY_MIN_MS
    df["is_sampling"] = (df["systemstatus"] == 1) & (df["valve_position_status"] == 1)
    df["speed_kn"] = df["speed_over_ground"] * MS_TO_KN

    along, off = project_many(df["latitude"].to_numpy(), df["longitude"].to_numpy(), line, cumulative)
    df["route_fraction"] = along / cumulative[-1]
    df["route_km"] = along / 1000
    df["off_route_m"] = off
    df["zone"] = zone_of(df["route_fraction"].to_numpy(), route["zones"])

    good = df["salinity"].notna() & df["tsg_temperature"].notna()
    sa = gsw.SA_from_SP(df.loc[good, "salinity"], 0, df.loc[good, "longitude"], df.loc[good, "latitude"])
    ct = gsw.CT_from_t(sa, df.loc[good, "tsg_temperature"], 0)
    df["sigma_t"] = np.nan
    df.loc[good, "sigma_t"] = gsw.sigma0(sa, ct)

    std = df.set_index("ts")["roll"].rolling(ROLL_WINDOW).std().to_numpy()
    df["roll_std_60s"] = std
    level = np.where(std < CALM_MAX_DEG, "calm", np.where(std < GENTLE_MAX_DEG, "gentle", "rolly"))
    df["comfort"] = np.where(np.isnan(std), None, level)


def project_many(lat: np.ndarray, lon: np.ndarray, line: list, cumulative: list) -> tuple[np.ndarray, np.ndarray]:
    """`project` from export_sample_data.py for many points: (metres along the line, metres off it)."""
    pts = np.asarray(line)
    cum = np.asarray(cumulative)
    kx = np.cos(np.radians(lat))[:, None] * 111320
    ky = 110574
    px, py = (lon[:, None] * kx), (lat[:, None] * ky)
    ax, ay = pts[:-1, 1][None, :] * kx, pts[:-1, 0][None, :] * ky
    bx, by = pts[1:, 1][None, :] * kx, pts[1:, 0][None, :] * ky
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    with np.errstate(invalid="ignore", divide="ignore"):
        t = np.clip(np.where(len2 > 0, ((px - ax) * dx + (py - ay) * dy) / len2, 0), 0, 1)
    d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
    seg = np.nanargmin(np.where(np.isnan(d2), np.inf, d2), axis=1)
    rows = np.arange(len(lat))
    along = cum[seg] + t[rows, seg] * (cum[seg + 1] - cum[seg])
    off = np.sqrt(d2[rows, seg])
    missing = np.isnan(lat) | np.isnan(lon)
    along[missing] = np.nan
    off[missing] = np.nan
    return along, off


def zone_of(fraction: np.ndarray, zones: list[dict]) -> np.ndarray:
    """Like `zoneAt` in frontend/src/ship/sailing.ts: the first zone that ends at or after the fraction."""
    ends = np.array([z["to"] for z in zones])
    ids = np.array([z["id"] for z in zones], dtype=object)
    idx = np.minimum(np.searchsorted(ends, fraction, side="left"), len(zones) - 1)
    out = ids[idx]
    out[np.isnan(fraction)] = None
    return out


# --- Route profile


def gebco_depth(path: Path, line: list, cumulative: list) -> list[float | None]:
    """Water depth (m, positive down; 0 on land cells) at the middle of each bin, nearest GEBCO cell."""
    grid = xr.open_dataset(path)["elevation"]
    mids = [point_along(line, cumulative, (b + 0.5) / BINS * cumulative[-1]) for b in range(BINS)]
    elevation = grid.sel(
        lat=xr.DataArray([p[0] for p in mids]), lon=xr.DataArray([p[1] for p in mids]), method="nearest"
    ).to_numpy()
    return [max(0.0, -float(e)) for e in elevation]


def build_profile(
    df: pd.DataFrame, crossings: pd.DataFrame, route: dict, line: list, cumulative: list, depth: list
) -> pd.DataFrame:
    underway = df[df["is_underway"] & df["crossing_id"].notna() & df["route_fraction"].notna()].copy()
    underway["bin"] = np.minimum((underway["route_fraction"] * BINS).astype(int), BINS - 1)
    groups = [(0, underway)] + [(int(c), g) for c, g in underway.groupby("crossing_id")]

    base = pd.DataFrame({"bin": range(BINS)})
    base["fraction"] = (base["bin"] + 0.5) / BINS
    base["km"] = base["fraction"] * cumulative[-1] / 1000
    base["zone"] = zone_of(base["fraction"].to_numpy(), route["zones"])
    mids = [point_along(line, cumulative, f * cumulative[-1]) for f in base["fraction"]]
    base["lat"] = [p[0] for p in mids]
    base["lon"] = [p[1] for p in mids]
    base["depth_m"] = depth

    frames = []
    for crossing_id, g in groups:
        cols = {name: g[col] for name, col in PROFILE_VALUES.items()}
        binned = pd.DataFrame({"bin": g["bin"], "speed_kn": g["speed_kn"], **cols}).groupby("bin")
        means = binned.mean()
        means["n"] = binned.size()
        out = base.merge(means, left_on="bin", right_index=True, how="left")
        out["n"] = out["n"].fillna(0).astype(int)
        for name in ANOMALIES:
            out[f"{name}_anom"] = out[name] - cols[name].mean()
        out.insert(0, "crossing_id", crossing_id)
        frames.append(out)
    return pd.concat(frames, ignore_index=True)


# --- Crossing stats


def build_stats(df: pd.DataFrame, crossings: pd.DataFrame) -> pd.DataFrame:
    rows = []
    previous_end = None
    for c in crossings.itertuples():
        g = df[df["crossing_id"] == c.id]
        lat, lon = np.radians(g["latitude"].to_numpy()), np.radians(g["longitude"].to_numpy())
        h = np.sin(np.diff(lat) / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(np.diff(lon) / 2) ** 2
        track_km = np.nansum(2 * 6371.0088 * np.arcsin(np.sqrt(h)))
        uw = g[g["is_underway"]]
        rows.append(
            {
                "id": c.id,
                "direction": c.direction,
                "start_ts": c.start_ts,
                "end_ts": c.end_ts,
                "duration_min": (c.end_ts - c.start_ts).total_seconds() / 60,
                "track_km": track_km,
                "avg_kn": g["speed_kn"].mean(),
                "max_kn": g["speed_kn"].max(),
                "dwell_before_min": None if previous_end is None else (c.start_ts - previous_end).total_seconds() / 60,
                "active_pass_min": (g["zone"] == "active-pass").sum() / 60,
                "roll_std": uw["roll"].std(),
                "max_abs_roll": g["roll"].abs().max(),
                "sst": uw["tsg_temperature"].mean(),
                "salinity": uw["salinity"].mean(),
                "salinity_min": uw["salinity"].min(),
                "salinity_max": uw["salinity"].max(),
                "o2_sat": uw["oxygen_saturation"].mean(),
                "chl": uw["chlorophyll"].mean(),
                "tsg_missing": bool(uw["salinity"].notna().mean() < 0.1),
            }
        )
        previous_end = c.end_ts
    return pd.DataFrame(rows)


# --- Output


DERIVED_COLUMNS = [
    "ts", "crossing_id", "is_underway", "is_sampling", "speed_kn", "route_fraction", "route_km",
    "off_route_m", "zone", "sigma_t", "roll_std_60s", "comfort", "tsg_flag", "oxygen_flag", "optics_flag",
]  # fmt: skip


def copy_frame(cursor, table: str, frame: pd.DataFrame) -> None:
    buf = io.StringIO()
    frame.to_csv(buf, index=False, header=False, na_rep="")
    buf.seek(0)
    cursor.copy_expert(f"copy {table} ({', '.join(frame.columns)}) from stdin with (format csv, null '')", buf)


def write(df: pd.DataFrame, profile: pd.DataFrame, stats: pd.DataFrame) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("drop table if exists readings_derived, route_profile, crossing_stats"))
        for ddl in (DERIVED_DDL, PROFILE_DDL, STATS_DDL):
            conn.execute(text(ddl))
        cursor = conn.connection.driver_connection.cursor()
        copy_frame(cursor, "readings_derived", df[DERIVED_COLUMNS])
        copy_frame(cursor, "route_profile", profile)
        copy_frame(cursor, "crossing_stats", stats)
    print(f"Wrote readings_derived ({len(df)} rows), route_profile ({len(profile)}), crossing_stats ({len(stats)})")


def profile_json(profile: pd.DataFrame, crossing_id: int, direction: str | None, length_m: float) -> dict:
    """Same shape as GET /route/profile (backend/app/routes/derived.py)."""
    p = profile[profile["crossing_id"] == crossing_id]
    bins = []
    for r in p.itertuples():
        bins.append(
            {
                "bin": r.bin,
                "fraction": round(r.fraction, 4),
                "km": round(r.km, 2),
                "zone": r.zone,
                "lat": round(r.lat, 5),
                "lon": round(r.lon, 5),
                "depth_m": rounded(r.depth_m, 0),
                "n": r.n,
                **{name: rounded(getattr(r, name), 3) for name in (*PROFILE_VALUES, *(f"{a}_anom" for a in ANOMALIES))},
            }
        )
    return {"crossing_id": crossing_id, "direction": direction, "length_km": round(length_m / 1000, 2), "bins": bins}


def rounded(value, digits: int):
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits) if digits else round(float(value))


def describe(df: pd.DataFrame, profile: pd.DataFrame, stats: pd.DataFrame) -> None:
    print("QC flags (rows per flag):")
    for flag_col, cols in QC_GROUPS.values():
        counts = df[flag_col].value_counts(dropna=False).sort_index().to_dict()
        print(f"  {flag_col}: {counts}; rows with a value dropped as bad: {df.attrs[flag_col]}")
    uw = df["is_underway"]
    print(f"Underway {uw.sum()} s, sampling {df['is_sampling'].sum()} s, off route (median underway) {df.loc[uw, 'off_route_m'].median():.0f} m")
    print("Comfort (underway):", df.loc[uw, "comfort"].value_counts(normalize=True).round(3).to_dict())
    print("Crossings:")
    with pd.option_context("display.width", 200, "display.max_columns", 30):
        cols = ["id", "direction", "duration_min", "track_km", "avg_kn", "dwell_before_min", "active_pass_min",
                "roll_std", "sst", "salinity_min", "salinity_max", "o2_sat", "chl", "tsg_missing"]  # fmt: skip
        print(stats[cols].round(2).to_string(index=False))
    day = profile[profile["crossing_id"] == 0]
    print("All-crossings profile by zone (mean of bins):")
    print(day.groupby("zone", sort=False)[["km", "depth_m", "sst", "salinity", "o2_sat", "chl", "sigma_t", "sst_anom"]].mean().round(2).to_string())
    print(f"Depth along the route: max {day['depth_m'].max():.0f} m at km {day.loc[day['depth_m'].idxmax(), 'km']:.1f}; bins without water data: {(day['n'] == 0).sum()}")


if __name__ == "__main__":
    main()
