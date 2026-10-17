"""Tide and current predictions from DFO's Integrated Water Level System (IWLS API, no key).

- Tides at the nearest of DFO_TIDE_STATIONS: water level `wlp` (every 15 min) and the high and low
  tides `wlp-hilo`. Heights are metres above chart datum.
- Currents at DFO_CURRENT_STATION (Active Pass): speed `wcsp1` and direction `wcdp1` (every 15 min)
  and the events `wcp1-events` (SLACK, EXTREMA_FLOOD, EXTREMA_EBB, WEAK_AND_VARIABLE).

Units and conventions, checked on 2026-10-17:
- Current speeds are already KNOTS, not m/s. `GET /phenomena` gives unit `kn` for `wcs` (the
  phenomenon of `wcsp1` and `wcp1-events`), and the values are the ones in the CHS current table
  for Active Pass (tides.gc.ca and the printed Tide and Current Tables, both in knots): max flood
  3.6 kn at 06:53 PDT on 2026-10-17 is the API's EXTREMA_FLOOD 3.586 at 13:53Z. The 2026 maxima
  are about 6.5 kn flood and 5.5 kn ebb; read as m/s they would be about 12.6 kn, far above the
  6 to 7 kn that Active Pass reaches.
- Directions are where the water flows TOWARD (the set), degrees true. The CHS tables say
  "+ Flood direction 045 True, - Ebb direction 225 True" ("le courant porte vers", flows toward),
  and `wcdp1` takes exactly the station's `floodDirection` / `ebbDirection` (45 / 225, from
  `/stations/{id}/metadata`), with 44 / 224 now and then. So the flood sets NE, out of the pass
  toward the Strait of Georgia.

`/stations` resolves each station code once a day; each day of predictions is cached per
(station, local date) for DFO_CACHE_S. The "now" values are computed per request from that cache.
"""

import asyncio
import logging
import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, NoReturn

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.http import UpstreamError, get_json
from app.times import LOCAL_TZ, iso_utc, parse_iso

log = logging.getLogger(__name__)

STEP = timedelta(minutes=15)
STATION_TTL_S = 24 * 3600
# wlp-hilo has no high/low flag: each event is compared with its neighbours, so fetch a margin.
HILO_MARGIN = timedelta(hours=13)
EVENT_TYPES = {
    "SLACK": "slack",
    "WEAK_AND_VARIABLE": "slack",  # weak, turning current: the CHS tables list it with the turns
    "EXTREMA_FLOOD": "flood",
    "EXTREMA_EBB": "ebb",
}


@dataclass(frozen=True)
class Station:
    code: str
    id: str
    name: str
    lat: float
    lon: float
    flood_deg: float | None = None  # current stations: direction the flood flows toward


@dataclass(frozen=True)
class Day:
    """One local day, from local 00:00 to the next local 00:00 (both in UTC)."""

    date: date
    start: datetime
    end: datetime


@dataclass(frozen=True)
class Point:
    time: datetime
    value: float
    qualifier: str | None = None


@dataclass(frozen=True)
class CurrentDay:
    speed: tuple[Point, ...]  # knots, every 15 min
    direction: dict[datetime, float]  # degrees true, toward
    events: tuple[tuple[datetime, str, float], ...]  # (time, slack|flood|ebb, knots), local day only


_stations = TTLCache(max_entries=16)
_days = TTLCache(max_entries=64)


def local_day(now: datetime) -> Day:
    """The America/Vancouver day that contains `now`. 23 or 25 hours long on DST days."""
    today = now.astimezone(LOCAL_TZ).date()
    start = datetime.combine(today, time(), LOCAL_TZ)
    end = datetime.combine(today + timedelta(days=1), time(), LOCAL_TZ)
    return Day(today, start.astimezone(timezone.utc), end.astimezone(timezone.utc))


async def tides(settings: Settings, lat: float, lon: float, now: datetime) -> dict[str, Any]:
    """The `/api/tides` body. Raises `UpstreamError` when the tide part fails; a failing current
    station only makes `current` null."""
    stations = await _tide_stations(settings)
    station = min(stations, key=lambda s: _distance_m(lat, lon, s.lat, s.lon))
    day = local_day(now)
    tide, current = await asyncio.gather(
        _days.get(
            ("tide", station.code, day.date),
            settings.dfo_cache_s,
            lambda: _fetch_tide(settings, station, day),
        ),
        _current(settings, day, now),
    )
    return {
        "station": {"code": station.code, "name": station.name},
        "date": day.date.isoformat(),
        "stepMin": int(STEP.total_seconds() // 60),
        **tide,
        "current": current,
    }


async def _tide_stations(settings: Settings) -> list[Station]:
    results = await asyncio.gather(
        *(_station(settings, code) for code in settings.dfo_tide_stations), return_exceptions=True
    )
    found = [r for r in results if isinstance(r, Station)]
    for r in results:
        if isinstance(r, BaseException) and not isinstance(r, UpstreamError):
            raise r
    if not found:
        raise UpstreamError("no_station")
    return found


async def _station(settings: Settings, code: str, current: bool = False) -> Station:
    return await _stations.get(
        (code, current), STATION_TTL_S, lambda: _fetch_station(settings, code, current)
    )


async def _fetch_station(settings: Settings, code: str, current: bool) -> Station:
    body = await _get(settings, "/stations", {"code": code})
    rows = body if isinstance(body, list) else []
    match = next((s for s in rows if isinstance(s, dict) and s.get("code") == code and s.get("id")), None)
    if match is None or _num(match.get("latitude")) is None or _num(match.get("longitude")) is None:
        log.warning("DFO station %s not found", code)
        raise UpstreamError("unknown_station")
    flood_deg = None
    if current:
        meta = await _get(settings, f"/stations/{match['id']}/metadata", {})
        flood_deg = _num(meta.get("floodDirection")) if isinstance(meta, dict) else None
    return Station(
        code=code,
        id=str(match["id"]),
        name=str(match.get("officialName") or code),
        lat=float(match["latitude"]),
        lon=float(match["longitude"]),
        flood_deg=flood_deg,
    )


async def _fetch_tide(settings: Settings, station: Station, day: Day) -> dict[str, Any]:
    levels, hilo = await asyncio.gather(
        _series(settings, station, "wlp", day.start, day.end, "FIFTEEN_MINUTES"),
        _series(settings, station, "wlp-hilo", day.start - HILO_MARGIN, day.end + HILO_MARGIN),
    )
    by_time = {p.time: p.value for p in levels}
    slots = round((day.end - day.start) / STEP)  # 96 on a normal day, 92 or 100 on DST days
    heights = [_round(by_time.get(day.start + k * STEP), 2) for k in range(slots + 1)]
    if all(h is None for h in heights):
        raise UpstreamError("no_data")
    known = [h for h in heights if h is not None]
    mean = sum(known) / len(known)

    extremes = []
    for i, p in enumerate(hilo):
        if not day.start <= p.time < day.end:
            continue
        neighbours = [q.value for q in hilo[max(0, i - 1) : i + 2] if q is not p]
        reference = sum(neighbours) / len(neighbours) if neighbours else mean
        kind = "high" if p.value > reference else "low"
        extremes.append({"type": kind, "h": round(p.value, 2), "at": _hhmm(p.time)})
    return {"heights": heights, "extremes": extremes}


async def _current(settings: Settings, day: Day, now: datetime) -> dict[str, Any] | None:
    """The `current` part, or None when the current station cannot be read."""
    try:
        station = await _station(settings, settings.dfo_current_station, current=True)
        data: CurrentDay = await _days.get(
            ("current", station.code, day.date),
            settings.dfo_cache_s,
            lambda: _fetch_current(settings, station, day),
        )
    except UpstreamError:
        return None

    nearest = min(data.speed, key=lambda p: abs(p.time - now))
    toward = data.direction.get(nearest.time)
    floods = [kn for _, kind, kn in data.events if kind == "flood"]
    ebbs = [kn for _, kind, kn in data.events if kind == "ebb"]
    next_slack = next((t for t, kind, _ in data.events if kind == "slack" and t > now), None)
    return {
        "station": station.name,
        "speedKn": round(nearest.value, 1),
        "towardDeg": round(toward) % 360 if toward is not None else None,
        "flooding": _flooding(toward, station.flood_deg, data.events, now),
        "maxFloodKn": round(max(floods), 1) if floods else None,
        "maxEbbKn": round(max(ebbs), 1) if ebbs else None,
        "nextSlack": _hhmm(next_slack) if next_slack else None,
        "events": [{"type": kind, "at": _hhmm(t), "kn": round(kn, 1)} for t, kind, kn in data.events],
    }


async def _fetch_current(settings: Settings, station: Station, day: Day) -> CurrentDay:
    speed, direction, events = await asyncio.gather(
        _series(settings, station, "wcsp1", day.start, day.end, "FIFTEEN_MINUTES"),
        _series(settings, station, "wcdp1", day.start, day.end, "FIFTEEN_MINUTES"),
        _series(settings, station, "wcp1-events", day.start, day.end),
    )
    if not speed:
        raise UpstreamError("no_data")
    return CurrentDay(
        speed=tuple(speed),
        direction={p.time: p.value for p in direction},
        events=tuple(
            (p.time, EVENT_TYPES[p.qualifier], p.value)
            for p in events
            if p.qualifier in EVENT_TYPES and day.start <= p.time < day.end
        ),
    )


def _flooding(
    toward: float | None,
    flood_deg: float | None,
    events: tuple[tuple[datetime, str, float], ...],
    now: datetime,
) -> bool | None:
    """Whether the current now runs in the flood direction.

    Rule: the predicted direction now is within 90 degrees of the station's flood direction. That
    always agrees with `towardDeg` (the series only takes the flood or the ebb direction). Without a
    direction, the turn before and the turn after now are found in the events, and the extremum
    between them (flood or ebb) decides.
    """
    if toward is not None and flood_deg is not None:
        return abs((toward - flood_deg + 540) % 360 - 180) < 90
    before = max((t for t, kind, _ in events if kind == "slack" and t <= now), default=None)
    after = min((t for t, kind, _ in events if kind == "slack" and t > now), default=None)
    phase = [
        kind
        for t, kind, _ in events
        if kind != "slack" and (before is None or t > before) and (after is None or t < after)
    ]
    return phase[0] == "flood" if phase else None


async def _series(
    settings: Settings,
    station: Station,
    code: str,
    start: datetime,
    end: datetime,
    resolution: str | None = None,
) -> list[Point]:
    """One time series, `from` and `to` both inclusive, sorted by time."""
    params = {"time-series-code": code, "from": iso_utc(start), "to": iso_utc(end)}
    if resolution:
        params["resolution"] = resolution
    body = await _get(settings, f"/stations/{station.id}/data", params)
    if not isinstance(body, list):
        _fail("bad_response", f"{station.code} {code}")
    points = []
    for row in body:
        if not isinstance(row, dict):
            continue
        t, v = parse_iso(row.get("eventDate")), _num(row.get("value"))
        if t is not None and v is not None:
            points.append(Point(t, v, row.get("qualifier")))
    return sorted(points, key=lambda p: p.time)


async def _get(settings: Settings, path: str, params: dict[str, Any]) -> Any:
    try:
        status, body = await get_json(f"{settings.dfo_base_url}{path}", params)
    except UpstreamError as exc:
        _fail(exc.code, path)
    if status != 200:
        _fail({429: "rate_limited"}.get(status, f"http_{status}"), path)
    health.DFO.success()
    return body


def _fail(code: str, what: str) -> NoReturn:
    log.warning("DFO IWLS %s failed: %s", what, code)
    health.DFO.failure(code)
    raise UpstreamError(code)


def _hhmm(dt: datetime) -> str:
    return dt.astimezone(LOCAL_TZ).strftime("%H:%M")


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


def _num(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    return None


def _round(value: float | None, digits: int) -> float | None:
    return round(value, digits) if value is not None else None
