"""Measured wind at Environment and Climate Change Canada (ECCC) stations: the bridge `windobs` dataset.

The wind counterpart of the CODAR radar: the kiosk uses it first near each station and the Open-Meteo
model (`weather`) elsewhere. Every ECCC station that reports wind in OCEAN_AREA (47-51 N, 129.5-122 W):
lightstations and automatic stations on rocks and islands, airports, climate stations. ECCC's GeoMet
OGC API (https://api.weather.gc.ca), no key. At most ECCC_PARALLEL requests at a time.

- Stations: `climate-stations` over OCEAN_AREA (name, position, elevation), cached for a day. When the
  list cannot be read, the observations' own names and positions are used (elevM null). Names are
  tidied for display (NAMES, then `display_name`).
- Replay (`day`): `climate-hourly`, one request for the whole area (~1500 rows a day). Hourly, 25
  frames (local 00:00 to the next 00:00 inclusive). Its `datetime` filter and LOCAL_DATE are in Local
  STANDARD Time all year (UTC-8: in August a 12:00 query returns LOCAL_DATE 12:00 = UTC 20:00), so the
  request asks for the day in LST with LST_MARGIN on each side and rows are placed by UTC_DATE.
  WIND_SPEED is km/h (the mean of the last minutes before the hour); WIND_DIRECTION is in tens of
  degrees, 36 = north, 0 = calm. climate-hourly has no gusts: `gustKn` is null. ECCC publishes a day
  about one day later; a replayed day is final (kept in Neon) once it ended FINAL_AFTER_DAYS ago and
  its last frame has data, so stations that report late are not lost.
- Live (`live`): `swob-realtime` (SWOB-ML, the last 30 days), the last LIVE_HOURS at 10-minute steps
  (19 frames, both ends; the newest is the last mark at least LIVE_LAG_S old). Many automatic
  stations send an observation every minute that carries the running 10-minute mean; the others
  report hourly (Esquimalt every 15 minutes, airports hourly plus specials), so they fill every 6th
  frame. Instead of downloading every minute of the window (~3500 observations, 2 MB), each
  10-minute mark is asked on its own (`datetime=<instant>`, 20-100 observations), and a mark older
  than SETTLE_S (all its observations have arrived) is kept until it leaves the window: a refresh
  reads only the newest few marks.
  Speed: `avg_wnd_spd_10m_pst10mts` (10-minute mean ending at the observation time), else the 2-minute
  mean; direction from the same period, else the other; gust: `max_wnd_spd_10m_pst10mts` (highest in
  the 10 minutes), else `max_wnd_gst_spd_10m_pst10mts` (airports: only when gusty). One-minute values
  are not used (Tsawwassen's are stuck at 0 while its 10-minute mean is right). Units come from the
  `-uom` fields (km/h). Partner networks without a climate ID (BC highways, Parks Canada) are left out.

Both: knots (1 dp); `fromDeg` is where the wind blows FROM (int, 0 = north); calm is 0 kn with
`fromDeg` null. Stations without any wind value in the window are left out. Co-located duplicates
(one airport under two climate IDs, less than MERGE_KM apart): the one with more values is kept.
Order: nearest to the ferry route (Active Pass) first.
"""

import asyncio
import logging
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app import health
from app.cache import TTLCache
from app.config import OCEAN_AREA
from app.frames import Axis, day_axis, day_bounds, rnd
from app.http import UpstreamError, get_json
from app.times import LOCAL_TZ, iso_utc, parse_iso, utc_now

log = logging.getLogger(__name__)

API = "https://api.weather.gc.ca/collections"
CREDIT = "Environment and Climate Change Canada"
TIMEOUT_S = 45
ECCC_PARALLEL = 3
PAGE = 10000  # features per request (the API accepts more; a replayed day is ~1500 rows)
MAX_PAGES = 5
STATIONS_TTL_S = 24 * 3600
STATIONS_RETRY_S = 600
LST = timezone(timedelta(hours=-8))  # ECCC climate data: Local Standard Time all year
LST_MARGIN = timedelta(hours=2)
FINAL_AFTER_DAYS = 3
LIVE_STEP_S = 600
LIVE_HOURS = 3
LIVE_LAG_S = 120  # the newest frame is a mark at least this old (most observations are in by then)
SETTLE_S = 1800  # a mark this old has all its observations (they arrive within minutes)
OPEN_MARK_TTL_S = 240  # a newer mark is asked again on the next refresh
MERGE_KM = 0.5
ROUTE_CENTRE = (48.87, -123.31)  # Active Pass
BBOX = f"{OCEAN_AREA[2]},{OCEAN_AREA[0]},{OCEAN_AREA[3]},{OCEAN_AREA[1]}"  # west,south,east,north
TO_KNOTS = {"km/h": 1 / 1.852, "m/s": 3600 / 1852, "knots": 1.0, "knot": 1.0, "kt": 1.0, "kn": 1.0}

HOURLY_PROPS = "CLIMATE_IDENTIFIER,STATION_NAME,UTC_DATE,WIND_SPEED,WIND_DIRECTION"
SPEED_KEYS = ("avg_wnd_spd_10m_pst10mts", "avg_wnd_spd_10m_pst2mts")  # preferred first
DIR_KEYS = {  # speed key -> direction key of the same period
    "avg_wnd_spd_10m_pst10mts": "avg_wnd_dir_10m_pst10mts",
    "avg_wnd_spd_10m_pst2mts": "avg_wnd_dir_10m_pst2mts",
}
GUST_KEYS = ("max_wnd_spd_10m_pst10mts", "max_wnd_gst_spd_10m_pst10mts")
SWOB_PROPS = ",".join(
    (
        "clim_id-value",
        "stn_nam-value",
        "date_tm-value",
        "_is-minutely_obs-value",
        *SPEED_KEYS,
        *DIR_KEYS.values(),
        *GUST_KEYS,
        *(f"{key}-uom" for key in (*SPEED_KEYS, *GUST_KEYS)),
    )
)

# Display names of the stations near the route (by climate ID); others go through `display_name`.
NAMES = {
    "1108291": "Tsawwassen Ferry Terminal",
    "1018621": "Victoria Airport",
    "1017101": "Saturna Island",
    "1017099": "Saturna CAPMoN",
    "1013998": "Kelp Reefs",
    "1107010": "Sand Heads",
    "1106200": "Point Atkinson",
    "1022689": "Entrance Island",
    "1012475": "Discovery Island",
    "1016640": "Race Rocks",
    "1017254": "Sheringham Point",
    "1027403": "Sisters Island",
    "1020590": "Ballenas Island",
    "1108395": "Vancouver Airport",
    "1108380": "Sea Island (Coast Guard)",
    "1100909": "Boundary Bay Airport",
    "110Q44V": "Vancouver Harbour",
    "1108446": "Vancouver Harbour",
    "10459NN": "Pam Rocks (Howe Sound)",
    "1018619": "Victoria Harbour",
    "1018633": "Victoria Harbour",
    "1018611": "Victoria Gonzales",
    "1018598": "University of Victoria",
    "1012710": "Esquimalt Harbour",
    "1016943": "Saanichton",
    "1026271": "Port Hardy Airport",
    "1026273": "Port Hardy Airport (auto)",
    "1108910": "White Rock",
    "1086081": "Pemberton Airport",
}

_stations = TTLCache(max_entries=2)
_marks = TTLCache(max_entries=64)
_slots: dict[int, asyncio.Semaphore] = {}


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    lat: float
    lon: float
    elev_m: float | None


@dataclass(frozen=True)
class Obs:
    t: datetime
    kn: float
    from_deg: int | None
    gust_kn: float | None
    rank: int = 0  # wins a tie at the same time (a regular observation over a minutely one)


# --- Replay


async def day(d: date) -> tuple[dict[str, Any], bool]:
    """The `windobs` dataset for the local day `d` from climate-hourly, and whether it is final.
    Raises `UpstreamError` ("no_data" when ECCC has no wind for that day)."""
    axis = day_axis(d, 3600, include_end=True)
    last = axis.time(axis.n - 1)
    window = f"{_lst(axis.t0 - LST_MARGIN)}/{_lst(last + LST_MARGIN)}"
    try:
        rows, meta = await asyncio.gather(
            _items("climate-hourly", {"bbox": BBOX, "datetime": window, "properties": HOURLY_PROPS}),
            stations(),
        )
    except UpstreamError as exc:
        if exc.code != "no_data":
            log.warning("ECCC climate-hourly failed: %s", exc.code)
            health.ECCC.failure(exc.code)
        raise
    obs: dict[str, list[Obs]] = {}
    found: dict[str, Station] = {}
    for feature in rows:
        p = feature.get("properties") or {}
        sid = p.get("CLIMATE_IDENTIFIER")
        o = _hourly_obs(p)
        if not sid or o is None:
            continue
        sid = str(sid)
        obs.setdefault(sid, []).append(o)
        if sid not in found:
            found[sid] = _feature_station(sid, p.get("STATION_NAME"), feature)
    health.ECCC.success()
    payload = _payload(axis, "replay", d, obs, meta, found)
    if not payload["stations"]:
        raise UpstreamError("no_data")
    covered = any(o.t >= last for series in obs.values() for o in series)
    final = covered and utc_now() - day_bounds(d)[1] >= timedelta(days=FINAL_AFTER_DAYS)
    return payload, final


def _hourly_obs(p: dict[str, Any]) -> Obs | None:
    t = parse_iso(p.get("UTC_DATE"))  # "2026-08-17T19:00:00", UTC without an offset
    speed = _number(p.get("WIND_SPEED"))
    if t is None or speed is None or speed < 0:
        return None
    kn = speed * TO_KNOTS["km/h"]
    tens = _number(p.get("WIND_DIRECTION"))
    from_deg = int(round(tens)) * 10 % 360 if kn > 0 and tens is not None and 1 <= tens <= 36 else None
    return Obs(t, kn, from_deg, None)


def _lst(dt: datetime) -> str:
    return dt.astimezone(LST).strftime("%Y-%m-%dT%H:%M:%S")


# --- Live


def live_axis(now: datetime) -> Axis:
    """The last LIVE_HOURS up to the newest 10-minute mark at least LIVE_LAG_S old, both ends
    included (19 frames)."""
    end = math.floor((now.timestamp() - LIVE_LAG_S) / LIVE_STEP_S) * LIVE_STEP_S
    start = datetime.fromtimestamp(end - LIVE_HOURS * 3600, timezone.utc)
    return Axis(start, LIVE_STEP_S, LIVE_HOURS * 3600 // LIVE_STEP_S + 1)


async def live(now: datetime) -> tuple[dict[str, Any], bool]:
    """The live `windobs` dataset from SWOB, and whether every mark was read (False: retry soon).
    Raises `UpstreamError` when no mark can be read ("no_data" when none has wind)."""
    axis = live_axis(now)
    results = await asyncio.gather(
        *(_mark(axis.time(i), now) for i in range(axis.n)), stations(), return_exceptions=True
    )
    *marks, meta = results
    for result in results:
        if isinstance(result, BaseException) and not isinstance(result, UpstreamError):
            raise result
    errors = [m for m in marks if isinstance(m, UpstreamError)]
    if len(errors) == len(marks):
        log.warning("ECCC swob-realtime failed: %s", errors[0].code)
        health.ECCC.failure(errors[0].code)
        raise UpstreamError(errors[0].code)
    obs: dict[str, list[Obs]] = {}
    found: dict[str, Station] = {}
    for features in marks:
        if isinstance(features, UpstreamError):
            continue
        for feature in features:
            p = feature.get("properties") or {}
            sid = p.get("clim_id-value")
            o = _swob_obs(p)
            if not sid or o is None:  # partner networks have no climate ID
                continue
            sid = str(sid)
            obs.setdefault(sid, []).append(o)
            if sid not in found:
                found[sid] = _feature_station(sid, p.get("stn_nam-value"), feature)
    health.ECCC.success(f"partial:{len(errors)}_marks" if errors else None)
    local_day = now.astimezone(LOCAL_TZ).date()
    payload = _payload(axis, "live", local_day, obs, meta if isinstance(meta, dict) else {}, found)
    if not payload["stations"]:
        raise UpstreamError("no_data")
    return {**payload, "now": iso_utc(now)}, not errors


async def _mark(t: datetime, now: datetime) -> list[dict]:
    """Every SWOB observation in OCEAN_AREA at the instant `t`."""
    settled = (now - t).total_seconds() >= SETTLE_S
    ttl = LIVE_HOURS * 3600 + 2 * SETTLE_S if settled else OPEN_MARK_TTL_S

    async def fetch() -> list[dict]:
        params = {"bbox": BBOX, "datetime": iso_utc(t), "properties": SWOB_PROPS}
        return await _items("swob-realtime", params)

    return await _marks.get(("mark", int(t.timestamp()), settled), ttl, fetch)


def _swob_obs(p: dict[str, Any]) -> Obs | None:
    t = parse_iso(p.get("date_tm-value"))
    if t is None:
        return None
    for key in SPEED_KEYS:
        kn = _knots(p, key)
        if kn is not None:
            break
    else:
        return None
    if kn < 0:
        return None
    directions = [DIR_KEYS[key]] + [d for d in DIR_KEYS.values() if d != DIR_KEYS[key]]
    deg = next((v for v in (_number(p.get(k)) for k in directions) if v is not None), None)
    from_deg = int(round(deg)) % 360 if kn > 0 and deg is not None and 0 < deg <= 360 else None
    gust = next((v for v in (_knots(p, k) for k in GUST_KEYS) if v is not None), None)
    minutely = p.get("_is-minutely_obs-value") is True
    return Obs(t, kn, from_deg, gust, 0 if minutely else 1)


def _knots(p: dict[str, Any], key: str) -> float | None:
    value = _number(p.get(key))
    if value is None:
        return None
    factor = TO_KNOTS.get(str(p.get(f"{key}-uom", "")).strip().lower())
    if factor is None:
        log.warning("ECCC SWOB: unknown unit %r for %s", p.get(f"{key}-uom"), key)
        return None
    return value * factor


# --- Stations


async def stations() -> dict[str, Station]:
    """ECCC climate stations in OCEAN_AREA by climate ID, cached for a day. {} when the list cannot
    be read (the observations' own names and positions are used then)."""
    try:
        return await _stations.get("list", STATIONS_TTL_S, _fetch_stations, STATIONS_RETRY_S)
    except UpstreamError as exc:
        log.warning("ECCC climate-stations failed (%s); using the observations' names", exc.code)
        return {}


async def _fetch_stations() -> dict[str, Station]:
    features = await _items(
        "climate-stations", {"bbox": BBOX, "properties": "CLIMATE_IDENTIFIER,STATION_NAME,ELEVATION"}
    )
    out: dict[str, Station] = {}
    for feature in features:
        p = feature.get("properties") or {}
        sid = p.get("CLIMATE_IDENTIFIER")
        if not sid:
            continue
        station = _feature_station(str(sid), p.get("STATION_NAME"), feature, _number(p.get("ELEVATION")))
        if not math.isnan(station.lat):
            out[station.id] = station
    return out


def _feature_station(sid: str, name: Any, feature: dict[str, Any], elev_m: float | None = None) -> Station:
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    lon = _number(coords[0]) if len(coords) > 1 else None
    lat = _number(coords[1]) if len(coords) > 1 else None
    if elev_m is None and len(coords) > 2:
        elev_m = _number(coords[2])  # SWOB points carry the station height
    return Station(
        sid,
        display_name(sid, name),
        lat if lat is not None else math.nan,
        lon if lon is not None else math.nan,
        elev_m,
    )


def display_name(sid: str, raw: Any) -> str:
    """A tidy name: NAMES, else ECCC's upper-case name without network suffixes, airports as such
    ("NANAIMO A" -> "Nanaimo Airport", "ESTEVAN POINT CS" -> "Estevan Point")."""
    if sid in NAMES:
        return NAMES[sid]
    name = " ".join(str(raw or sid).split())
    airport = False
    for suffix in (" (AUT)", " AUT", " AUTO", " CS", " CCG", " (WIND)", " (WINDS)", " CAMPBELL SCIENTIFIC", " A"):
        if name.upper().endswith(suffix):
            name = name[: -len(suffix)]
            airport = airport or suffix == " A"
    name = " ".join(word.capitalize() for word in name.split(" ")).replace("Intl", "International")
    if airport and "airport" not in name.lower():
        name += " Airport"
    return name


# --- Payload


def _payload(
    axis: Axis,
    mode: str,
    d: date,
    obs: dict[str, list[Obs]],
    meta: dict[str, Station],
    found: dict[str, Station],
) -> dict[str, Any]:
    rows = []
    for sid, series in obs.items():
        station = meta.get(sid) or found.get(sid)
        if station is None or math.isnan(station.lat) or math.isnan(station.lon):
            continue
        kn, from_deg, gust = _series(axis, series)
        count = sum(v is not None for v in kn)
        if count:
            rows.append((count, station, kn, from_deg, gust))
    kept: list[tuple[int, Station, list, list, list | None]] = []
    for row in sorted(rows, key=lambda r: (-r[0], r[1].id)):
        if all(_km(row[1].lat, row[1].lon, k[1].lat, k[1].lon) >= MERGE_KM for k in kept):
            kept.append(row)
    kept.sort(key=lambda r: (_km(r[1].lat, r[1].lon, *ROUTE_CENTRE), r[1].id))
    return {
        "dataset": "windobs",
        "mode": mode,
        "date": d.isoformat(),
        **axis.header(),
        "stations": [
            {
                "id": station.id,
                "name": station.name,
                "lat": round(station.lat, 4),
                "lon": round(station.lon, 4),
                "elevM": rnd(station.elev_m, 1),
                "kn": kn,
                "fromDeg": from_deg,
                "gustKn": gust,
            }
            for _, station, kn, from_deg, gust in kept
        ],
        "credit": CREDIT,
    }


def _series(axis: Axis, series: list[Obs]) -> tuple[list[Any], list[Any], list[Any] | None]:
    """Each observation on its nearest frame; per frame the one closest in time wins (then the newest,
    then a regular over a minutely one)."""
    best: dict[int, tuple[tuple[float, float, int], Obs]] = {}
    for o in series:
        i = axis.nearest(o.t)
        if i is None:
            continue
        key = (abs((o.t - axis.time(i)).total_seconds()), -o.t.timestamp(), -o.rank)
        if i not in best or key < best[i][0]:
            best[i] = (key, o)
    kn: list[Any] = [None] * axis.n
    from_deg: list[Any] = [None] * axis.n
    gust: list[Any] = [None] * axis.n
    for i, (_, o) in best.items():
        kn[i] = rnd(o.kn, 1)
        from_deg[i] = o.from_deg
        gust[i] = rnd(o.gust_kn, 1)
    return kn, from_deg, gust if any(g is not None for g in gust) else None


# --- HTTP


async def _items(collection: str, params: dict[str, Any]) -> list[dict]:
    """Every feature of an OGC API `items` query, PAGE at a time."""
    features: list[dict] = []
    for _ in range(MAX_PAGES):
        async with _slot():
            status, body = await get_json(
                f"{API}/{collection}/items",
                {"f": "json", "limit": PAGE, "offset": len(features), **params},
                timeout_s=TIMEOUT_S,
            )
        if status == 400 and "out of range" in str((body or {}).get("description", "")):
            raise UpstreamError("no_data")  # a date outside the archive
        if status != 200:
            raise UpstreamError({429: "rate_limited"}.get(status, f"http_{status}"))
        page = body.get("features") if isinstance(body, dict) else None
        if not isinstance(page, list):
            raise UpstreamError("bad_response")
        features.extend(f for f in page if isinstance(f, dict))
        matched = body.get("numberMatched")
        if len(page) < PAGE or (isinstance(matched, int) and len(features) >= matched):
            return features
    log.warning("ECCC %s: more than %d features; truncated", collection, PAGE * MAX_PAGES)
    return features


def _slot() -> asyncio.Semaphore:
    """At most ECCC_PARALLEL requests to ECCC at a time (one semaphore per event loop)."""
    loop = asyncio.get_running_loop()
    return _slots.setdefault(id(loop), asyncio.Semaphore(ECCC_PARALLEL))


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    x = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * 111.2
    y = (lat2 - lat1) * 111.2
    return math.hypot(x, y)
