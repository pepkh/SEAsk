"""Hourly weather over the bridge map from Open-Meteo (no key): the bridge `weather` dataset.

- Atmosphere: a regular grid over BRIDGE_BBOX at BRIDGE_WX_GRID_DEG (0.05° = 17 x 19 = 323 points),
  replay and live alike. A replayed day uses the historical-forecast API (the forecasts as they were
  issued); live the forecast API, 3 h back and 6 h ahead. Open-Meteo takes comma-separated coordinate
  lists, at most 100 per request, so the grid goes in parallel chunks.
- Marine: waves, sea temperature and surface current at MARINE_POINTS (along the ferry route and in
  the Strait), with `cell_selection=sea`. The marine model cells are about 1/12° (~9 km), so
  neighbouring route points can share a cell. Live: read every hour.
- Wide: wind and gusts on WIDE_STEP (0.25° x 0.35° = 17 x 22 = 374 points) over OCEAN_AREA (47-51 N,
  129.5-122 W), for the map zoomed out to the open Pacific, replay and live alike.

The free tier counts every point of every request as one call (600 a minute, 5000 an hour, 10000 a
day). So requests are paced to CALLS_PER_MINUTE, and live `atmosphere` and `wide` are read once per
LIVE_BLOCK_H hours over a window that covers every live axis of the block, then sliced
(`live_block`). The blocks are staggered by an hour (atmosphere at 0, 3, 6 ... UTC, wide at 1, 4,
7 ..., the ocean dataset's global currents at 2, 5, 8 ...), so no hour reads more than ~400 points.
Live per day: atmosphere 8 x 323 + wide 8 x 374 + marine 24 x 14 = 5912 calls (+ 8 x 277 = 2216 for
the ocean's global currents: 8128), plus ~1000 for each new replayed day of weather and ocean.
A live atmosphere or wide block that fails, or comes back without a variable Open-Meteo could not
serve, is asked again after BLOCK_RETRY_S (a failed marine part after a minute), and a replayed day
with such a part is not stored as final.

Units (the ones the conversions rely on are checked in `hourly_units`; a mismatch fails the part):
- wind and gusts in knots (`wind_speed_unit=kn`); wind direction is where the wind blows FROM.
- visibility in metres, sent as km.
- ocean_current_velocity in km/h, sent as knots. ocean_current_direction is where the current
  flows TOWARD (Open-Meteo: "direction following the flow of the current", 0° = going north),
  hence `currentTowardDeg`. wave_direction is where the waves come FROM (`waveFromDeg`).
"""

import asyncio
import json
import logging
import math
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app import health
from app.cache import TTLCache
from app.config import OCEAN_AREA, Settings
from app.frames import Axis, day_axis, rnd
from app.health import SourceHealth
from app.http import UpstreamError, get_text
from app.times import LOCAL_TZ, iso_utc, parse_iso

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HISTORY_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
FETCH_TIMEOUT_S = 30
CREDIT = "Weather data by Open-Meteo.com (CC BY 4.0)"

MAX_POINTS = 100  # per request (Open-Meteo limit)
# The free tier allows 600 calls a minute, each location of a request counting as one. A new replayed
# day reads ~700 at once (weather) plus ~280 (ocean): requests are paced to stay under the limit.
CALLS_PER_MINUTE = 500
LIVE_PAST_H = 3
LIVE_AHEAD_H = 6

# (payload key, Open-Meteo variable, unit the conversion relies on (None: not checked), digits, conversion)
Var = tuple[str, str, str | None, int, Callable[[float], float] | None]
Columns = dict[str, list[list[Any]]]  # {payload key: [n][points]}
ATMOSPHERE: tuple[Var, ...] = (
    ("windKn", "wind_speed_10m", "kn", 1, None),
    ("windFromDeg", "wind_direction_10m", None, 0, None),
    ("gustKn", "wind_gusts_10m", "kn", 1, None),
    ("pressureHpa", "pressure_msl", "hPa", 1, None),
    ("tempC", "temperature_2m", None, 1, None),
    ("cloudPct", "cloud_cover", None, 0, None),
    ("precipMm", "precipitation", "mm", 1, None),
    ("visKm", "visibility", "m", 1, lambda m: m / 1000),
)
MARINE: tuple[Var, ...] = (
    ("waveM", "wave_height", "m", 2, None),
    ("waveFromDeg", "wave_direction", None, 0, None),
    ("wavePeriodS", "wave_period", "s", 1, None),
    ("sstC", "sea_surface_temperature", None, 1, None),
    ("currentKn", "ocean_current_velocity", "km/h", 2, lambda kmh: kmh / 1.852),
    ("currentTowardDeg", "ocean_current_direction", None, 0, None),
)
# The `wide` part: wind over OCEAN_AREA.
WIDE: tuple[Var, ...] = ATMOSPHERE[:3]  # windKn, windFromDeg, gustKn
WIDE_STEP = (0.25, 0.35)  # degrees of latitude and longitude (replay and live)
LIVE_BLOCK_H = 3  # live atmosphere and wide are read once per block
ATMOSPHERE_PHASE_H = 0  # blocks start at 0, 3, 6 ... UTC
WIDE_PHASE_H = 1  # 1, 4, 7 ... (the ocean dataset's global currents: 2, 5, 8 ...)
LIVE_PART_TTL_S = 3600  # live marine, per hour
BLOCK_RETRY_S = 600  # a failed or degraded part is retried after 10 minutes, not every minute
KNOTS = {"wind_speed_unit": "kn"}
SEA = {"cell_selection": "sea"}
# Degree values that must wrap: 360 -> 0.
ANGLES = {"windFromDeg", "waveFromDeg", "currentTowardDeg"}

# Ten points evenly spaced along the route (frontend/src/config/route.json, by distance from
# Swartz Bay; Active Pass at 0.564) and four in the open water around it.
MARINE_POINTS: tuple[tuple[str, float, float], ...] = (
    ("Swartz Bay", 48.6934, -123.3985),
    ("Swanson Channel S", 48.7199, -123.3498),
    ("Swanson Channel", 48.7653, -123.3446),
    ("Swanson Channel N", 48.8110, -123.3426),
    ("Active Pass W", 48.8545, -123.3544),
    ("Active Pass", 48.8670, -123.3067),
    ("Active Pass E", 48.8987, -123.2705),
    ("Strait of Georgia S", 48.9256, -123.2310),
    ("Strait of Georgia SE", 48.9512, -123.1895),
    ("Tsawwassen", 48.9842, -123.1511),
    ("Strait of Georgia Central", 49.0400, -123.4200),
    ("Strait of Georgia N", 49.2000, -123.4000),
    ("Strait of Georgia E", 49.0800, -123.2500),
    ("Boundary Pass", 48.7800, -123.0300),
)


_live_parts = TTLCache(max_entries=16)


class PartColumns(dict):
    """A part's columns `{key: [n][points]}`; `dropped` names the Open-Meteo variables it could not
    serve (their columns are all null): such a result is retried soon and never stored as final."""

    dropped: tuple[str, ...] = ()


def _degraded(*results: Any) -> bool:
    return any(getattr(result, "dropped", ()) for result in results)


@dataclass(frozen=True)
class Grid:
    """Regular lat/lon grid; cell index = iy * n_lon + ix, iy = 0 is the south row, ix = 0 the west.
    `step` is the latitude step, and the longitude step too unless `step_lon` is set."""

    lat0: float
    lon0: float
    step: float
    n_lat: int
    n_lon: int
    step_lon: float | None = None

    @property
    def d_lon(self) -> float:
        return self.step if self.step_lon is None else self.step_lon

    def points(self) -> list[tuple[float, float]]:
        return [
            (round(self.lat0 + iy * self.step, 4), round(self.lon0 + ix * self.d_lon, 4))
            for iy in range(self.n_lat)
            for ix in range(self.n_lon)
        ]

    def header(self) -> dict[str, Any]:
        return {
            "lat0": self.lat0,
            "lon0": self.lon0,
            "dLat": self.step,
            "dLon": self.d_lon,
            "nLat": self.n_lat,
            "nLon": self.n_lon,
        }


def grid(settings: Settings, step: float) -> Grid:
    south, north, west, east = settings.bridge_bbox
    return Grid(south, west, step, round((north - south) / step) + 1, round((east - west) / step) + 1)


def area_grid(area: tuple[float, float, float, float], d_lat: float, d_lon: float) -> Grid:
    """A grid over `area` (south, north, west, east) with different latitude and longitude steps."""
    south, north, west, east = area
    return Grid(south, west, d_lat, round((north - south) / d_lat) + 1, round((east - west) / d_lon) + 1, d_lon)


async def day(settings: Settings, d: date) -> tuple[dict[str, Any], bool]:
    """The `weather` dataset for the local day `d`: hourly from local 00:00 to the next 00:00
    inclusive (25 frames), and whether it is complete (every part "ok" with every variable). Raises
    `UpstreamError` when every part fails ("no_data" when Open-Meteo has nothing for that day)."""
    axis = day_axis(d, 3600, include_end=True)
    window = {"start_hour": _hour(axis.t0), "end_hour": _hour(axis.time(axis.n - 1))}
    cells = grid(settings, settings.bridge_wx_grid_deg)
    wide_cells = area_grid(OCEAN_AREA, *WIDE_STEP)
    return await _build(
        axis,
        "replay",
        d,
        cells,
        wide_cells,
        _part(HISTORY_URL, cells.points(), ATMOSPHERE, window, axis, KNOTS, health.OPENMETEO_FORECAST),
        _part(MARINE_URL, _marine_points(), MARINE, window, axis, SEA, health.OPENMETEO),
        _part(HISTORY_URL, wide_cells.points(), WIDE, window, axis, KNOTS, health.OPENMETEO_FORECAST),
    )


async def live(settings: Settings, now: datetime) -> tuple[dict[str, Any], bool]:
    """The live `weather` dataset: hourly from 3 h before the current hour to 6 h after it, at the
    replay's resolution, and whether it is complete (every part "ok" with every variable). Each part
    is cached on its own (atmosphere and wide per LIVE_BLOCK_H block, marine per hour), so a retry
    after a failed part reads only that part."""
    axis = live_axis(now)
    hour = int(axis.t0.timestamp()) // 3600
    window = {"past_hours": LIVE_PAST_H, "forecast_hours": LIVE_AHEAD_H + 1}
    cells = grid(settings, settings.bridge_wx_grid_deg)
    wide_cells = area_grid(OCEAN_AREA, *WIDE_STEP)

    async def fetch_atmosphere(block_axis: Axis, block_window: dict[str, Any]) -> Columns:
        return await _part(
            FORECAST_URL, cells.points(), ATMOSPHERE, block_window, block_axis, KNOTS, health.OPENMETEO_FORECAST
        )

    async def fetch_wide(block_axis: Axis, block_window: dict[str, Any]) -> Columns:
        return await _part(
            FORECAST_URL, wide_cells.points(), WIDE, block_window, block_axis, KNOTS, health.OPENMETEO_FORECAST
        )

    async def marine() -> Columns:
        key = ("marine", hour)
        columns = await _live_parts.get(
            key,
            LIVE_PART_TTL_S,
            lambda: _part(MARINE_URL, _marine_points(), MARINE, window, axis, SEA, health.OPENMETEO),
        )
        if _degraded(columns):
            _live_parts.expire_within(key, BLOCK_RETRY_S)
        return columns

    payload, complete = await _build(
        axis,
        "live",
        now.astimezone(LOCAL_TZ).date(),
        cells,
        wide_cells,
        live_block(_live_parts, "atmosphere", axis, LIVE_BLOCK_H, fetch_atmosphere, ATMOSPHERE_PHASE_H),
        marine(),
        live_block(_live_parts, "wide", axis, LIVE_BLOCK_H, fetch_wide, WIDE_PHASE_H),
    )
    return {**payload, "now": iso_utc(now)}, complete


def live_axis(now: datetime) -> Axis:
    """Hourly from LIVE_PAST_H before the current hour to LIVE_AHEAD_H after it."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    return Axis(hour - timedelta(hours=LIVE_PAST_H), 3600, LIVE_PAST_H + LIVE_AHEAD_H + 1)


async def live_block(
    cache: TTLCache,
    name: str,
    axis: Axis,
    block_h: int,
    fetch: Callable[[Axis, dict[str, Any]], Awaitable[Columns]],
    phase_h: int = 0,
) -> Columns:
    """Hourly live columns fetched once per block of `block_h` hours (the free tier counts every
    point of every request) and sliced to `axis`. Blocks start `phase_h` hours after multiples of
    `block_h` hours UTC (so different parts do not all refresh in the same hour). `fetch(block_axis,
    window)` reads a window that covers the axes starting in any hour of the block. A failure, or a
    result without some variable (`PartColumns.dropped`), is retried after BLOCK_RETRY_S."""
    first = int(axis.t0.timestamp()) // 3600  # hours since 1970
    block = (first - phase_h) // block_h
    start_h = block * block_h + phase_h
    block_axis = Axis(datetime.fromtimestamp(start_h * 3600, timezone.utc), 3600, axis.n + block_h - 1)
    window = {"start_hour": _hour(block_axis.t0), "end_hour": _hour(block_axis.time(block_axis.n - 1))}
    key = (name, block, phase_h)
    columns = await cache.get(key, block_h * 3600, lambda: fetch(block_axis, window), BLOCK_RETRY_S)
    if _degraded(columns):
        cache.expire_within(key, BLOCK_RETRY_S)
    offset = first - start_h
    out = PartColumns({k: frames[offset : offset + axis.n] for k, frames in columns.items()})
    out.dropped = getattr(columns, "dropped", ())
    return out


async def _build(
    axis: Axis,
    mode: str,
    d: date,
    cells: Grid,
    wide_cells: Grid,
    atmosphere_part: Awaitable[Columns],
    marine_part: Awaitable[Columns],
    wide_part: Awaitable[Columns],
) -> tuple[dict[str, Any], bool]:
    """The payload, and whether it is complete (every part "ok" with every variable)."""
    atmosphere, marine, wide = await asyncio.gather(
        atmosphere_part, marine_part, wide_part, return_exceptions=True
    )
    parts = {
        "atmosphere": _part_status(atmosphere),
        "marine": _part_status(marine),
        "wide": _part_status(wide),
    }
    if all(status != "ok" for status in parts.values()):
        codes = [c for c in parts.values() if c != "no_data"]
        raise UpstreamError(codes[0] if codes else "no_data")
    complete = all(status == "ok" for status in parts.values()) and not _degraded(atmosphere, marine, wide)
    payload = {
        "dataset": "weather",
        "mode": mode,
        "date": d.isoformat(),
        **axis.header(),
        "parts": parts,
        "grid": cells.header(),
        "atmosphere": atmosphere if parts["atmosphere"] == "ok" else None,
        "marine": (
            {
                "points": {
                    "lat": [lat for _, lat, _ in MARINE_POINTS],
                    "lon": [lon for _, _, lon in MARINE_POINTS],
                    "name": [name for name, _, _ in MARINE_POINTS],
                },
                **marine,
            }
            if parts["marine"] == "ok"
            else None
        ),
        "wide": {"grid": wide_cells.header(), **wide} if parts["wide"] == "ok" else None,
        "credit": CREDIT,
    }
    return payload, complete


def _marine_points() -> list[tuple[float, float]]:
    return [(lat, lon) for _, lat, lon in MARINE_POINTS]


def _part_status(result: Any) -> str:
    if isinstance(result, UpstreamError):
        return "no_data" if result.code == "no_data" else "weather_unavailable"
    if isinstance(result, BaseException):
        raise result
    return "ok"


async def hourly(
    url: str,
    points: list[tuple[float, float]],
    variables: tuple[Var, ...],
    window: dict[str, Any],
    axis: Axis,
    extra: dict[str, Any],
    state: SourceHealth,
) -> Columns:
    """Hourly `variables` at `points` (in chunks of MAX_POINTS) placed on `axis`: `{key: [n][points]}`.
    For other modules (the `ocean` dataset's global currents); see `_part`."""
    return await _part(url, points, variables, window, axis, extra, state)


async def _part(
    url: str,
    points: list[tuple[float, float]],
    variables: tuple[Var, ...],
    window: dict[str, Any],
    axis: Axis,
    extra: dict[str, Any],
    state: SourceHealth,
) -> dict[str, list[list[Any]]]:
    """`{key: [n][points]}` for every variable. Raises `UpstreamError`; "no_data" when every value
    is missing or Open-Meteo rejects the dates (out of its archive)."""
    params = {
        "hourly": ",".join(v[1] for v in variables),
        "timezone": "GMT",
        **window,
        **extra,
    }
    chunks = [points[i : i + MAX_POINTS] for i in range(0, len(points), MAX_POINTS)]
    # A variable that Open-Meteo cannot serve right now breaks the whole response: drop it and ask
    # again (up to two), so the wind still arrives; the dropped variable is all null.
    asked = list(variables)
    dropped: list[str] = []
    for _ in range(3):
        try:
            results = await asyncio.gather(*(_fetch(url, chunk, params) for chunk in chunks))
            break
        except _BrokenVariable as exc:
            known = [v for v in asked if v[1] == exc.name]
            if not known or len(dropped) >= 2:
                log.warning("Open-Meteo %s failed: stream error in %s", url.split("/")[2], exc.name)
                state.failure("stream_error")
                raise UpstreamError("stream_error") from None
            asked = [v for v in asked if v[1] != exc.name]
            dropped.append(exc.name)
            params = {**params, "hourly": ",".join(v[1] for v in asked)}
            log.warning("Open-Meteo %s: %s unavailable, asking without it", url.split("/")[2], exc.name)
        except UpstreamError as exc:
            if exc.code != "no_data":
                log.warning("Open-Meteo %s failed: %s", url.split("/")[2], exc.code)
                state.failure(exc.code)
            raise
    locations = [loc for chunk in results for loc in chunk]
    if len(locations) != len(points):
        state.failure("bad_response")
        raise UpstreamError("bad_response")
    try:
        out = _columns(locations, tuple(asked), axis)
    except UpstreamError as exc:
        log.warning("Open-Meteo %s: %s", url.split("/")[2], exc.code)
        state.failure(exc.code)
        raise
    for key, *_ in variables:
        out.setdefault(key, [[None] * len(points) for _ in range(axis.n)])
    state.success(f"without {', '.join(dropped)}" if dropped else None)
    if all(v is None for column in out.values() for frame in column for v in frame):
        raise UpstreamError("no_data")
    result = PartColumns(out)
    result.dropped = tuple(dropped)
    return result


class _CallBudget:
    """Token bucket of Open-Meteo calls: `take(n)` waits until n calls fit in the per-minute budget."""

    def __init__(self, per_minute: int):
        self.capacity = float(per_minute)
        self.rate = per_minute / 60
        self.tokens = self.capacity
        self.updated = time.monotonic()

    async def take(self, n: int) -> None:
        while True:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
            self.updated = now
            if self.tokens >= n:
                self.tokens -= n
                return
            await asyncio.sleep((n - self.tokens) / self.rate)


_budget = _CallBudget(CALLS_PER_MINUTE)


class _BrokenVariable(UpstreamError):
    """Open-Meteo answered 200 but broke off while streaming one variable (one of its upstream models
    was down: "Unexpected error while streaming data: allEndpointsUnavailable")."""

    def __init__(self, name: str):
        super().__init__("stream_error")
        self.name = name


STREAM_ERROR = "Unexpected error while streaming data"
_STREAMING_VAR = re.compile(r'"(\w+)":\[[^\[\]]*$')


async def _fetch(url: str, points: list[tuple[float, float]], params: dict[str, Any]) -> list[dict]:
    await _budget.take(len(points))
    status, text = await get_text(
        url,
        {
            **params,
            "latitude": ",".join(str(lat) for lat, _ in points),
            "longitude": ",".join(str(lon) for _, lon in points),
        },
        # Up to 100 points per request: slower than one point, so more than HTTP_TIMEOUT_S.
        timeout_s=FETCH_TIMEOUT_S,
    )
    try:
        body = json.loads(text)
    except ValueError:
        body = None
        cut = text.find(STREAM_ERROR)
        if status == 200 and cut >= 0:
            match = _STREAMING_VAR.search(text[:cut])
            if match:
                raise _BrokenVariable(match.group(1)) from None
    if status == 400:
        # Dates out of range ({"error": true, "reason": ...}); the reason holds no secrets.
        reason = body.get("reason") if isinstance(body, dict) else None
        log.info("Open-Meteo %s: 400 %s", url.split("/")[2], reason)
        raise UpstreamError("no_data")
    if status != 200:
        raise UpstreamError({429: "rate_limited"}.get(status, f"http_{status}"))
    locations = [body] if isinstance(body, dict) else body  # one point gives an object, not a list
    if not isinstance(locations, list) or not all(isinstance(loc, dict) for loc in locations):
        raise UpstreamError("bad_response")
    return locations


def _columns(locations: list[dict], variables: tuple[Var, ...], axis: Axis) -> dict[str, list[list[Any]]]:
    """Frame-major columns: `out[key][frame][point]`, placed on `axis` by time."""
    out = {key: [[None] * len(locations) for _ in range(axis.n)] for key, *_ in variables}
    for p, loc in enumerate(locations):
        hourly, units = loc.get("hourly"), loc.get("hourly_units")
        if not isinstance(hourly, dict) or not isinstance(units, dict):
            raise UpstreamError("bad_response")
        frames = [_frame(axis, t) for t in hourly.get("time") or []]
        for key, name, unit, digits, convert in variables:
            if unit is not None and units.get(name) != unit:
                raise UpstreamError(f"unit_{name}")
            for i, value in zip(frames, hourly.get(name) or [], strict=False):
                if i is None or not _is_number(value):
                    continue
                v = rnd(convert(value) if convert else value, digits)
                out[key][i][p] = v % 360 if key in ANGLES and v is not None else v
    return out


def _frame(axis: Axis, value: Any) -> int | None:
    t = parse_iso(value)  # "2026-08-17T07:00", GMT without an offset
    return axis.nearest(t) if t is not None else None


def _hour(dt: datetime) -> str:
    return iso_utc(dt)[:16]  # "2026-08-17T07:00" (the request uses timezone=GMT)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
