"""Bridge datasets read from upstream APIs on demand: tides (DFO), weather (Open-Meteo), the ONC
observatories, model currents (SalishSeaCast and Open-Meteo Marine) and measured wind (ECCC), for a
replayed day (`/bridge/{date}/...`) and live (`/api/bridge/...`), plus the live CODAR surface currents
(`/api/bridge/currents`; the replayed currents come from Neon).

A replayed day is cached in memory and, once the day has ended and every part loaded, in the Neon
table `bridge_cache` (`app/bridge_cache.py`), so ONC, Open-Meteo, DFO, UBC and ECCC are read once per
day. Tides and weather also serve today and tomorrow (predictions and forecasts); the ONC stations and
the measured wind only finished days. Live payloads are the same shapes over a window around now, with `"mode": "live"`
and `"now"`.
"""

import json
from collections.abc import Awaitable, Callable
from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app import bridge_cache
from app.cache import TTLCache
from app.config import get_settings
from app.frames import json_response, to_bytes
from app.http import UpstreamError
from app.routes.bridge import DATE_PATH, REPLAY_MAX_AGE_S
from app.routes.ship import onc_settings, onc_unavailable
from app.sources import codar, dfo, eccc_wind, meteo_grid, ocean_model, onc_stations
from app.times import LOCAL_TZ, iso_utc, utc_now

router = APIRouter(prefix="/bridge", tags=["bridge replay"])
live_router = APIRouter(prefix="/api/bridge", tags=["live"])

# Memory TTL of a replayed day that has not ended (today, tomorrow) or that is incomplete.
TIDES_OPEN_TTL_S = 1800
# Weather: the models update hourly and the Open-Meteo free tier counts every grid point as a call.
WEATHER_TTL_S = 3600
# Ocean: SalishSeaCast's forecast is read per hour; a replayed day not final yet is rebuilt hourly.
OCEAN_TTL_S = 3600
# Measured wind: a replayed day ECCC may still complete (stations reporting late) is rebuilt hourly.
WINDOBS_OPEN_TTL_S = 3600

_live = TTLCache(max_entries=32)

Mode = Literal["replay", "live"]
Num = float | None
Int = int | None


# --- Response models (for /docs; the payloads are sent as prebuilt JSON bytes)


class TimeAxis(BaseModel):
    dataset: str
    mode: Mode
    date: str = Field(description="Local date (America/Vancouver).", examples=["2026-08-17"])
    t0: str = Field(description="Time of frame 0, UTC.", examples=["2026-08-17T07:00:00Z"])
    stepS: int = Field(description="Seconds between frames.")
    n: int = Field(description="Number of frames; every per-time list has n values.")
    now: str | None = Field(None, description="Live only: when the payload was built, UTC.")


class TideExtreme(BaseModel):
    type: Literal["high", "low"]
    h: float = Field(description="Height above chart datum, m.", examples=[3.24])
    t: str = Field(description="Time, UTC.", examples=["2026-08-17T20:24:00Z"])


class TideStation(BaseModel):
    code: str = Field(examples=["07270"])
    name: str = Field(examples=["Swartz Bay"])
    lat: float
    lon: float
    heights: list[Num] = Field(description="Predicted water level above chart datum, m, every 15 min.")
    extremes: list[TideExtreme] = Field(description="High and low tides of the day, in time order.")


class CurrentEvent(BaseModel):
    type: Literal["slack", "flood", "ebb"] = Field(description="Slack (turn) or maximum flood or ebb.")
    t: str = Field(description="Time, UTC.")
    kn: float = Field(description="Speed, knots (0 at slack).")


class TidalCurrent(BaseModel):
    code: str = Field(examples=["07527"])
    station: str = Field(examples=["Active Pass"])
    lat: float
    lon: float
    floodDeg: Int = Field(description="Direction the flood flows toward, degrees true (45 at Active Pass).")
    kn: list[Num] = Field(description="Predicted speed, knots.")
    towardDeg: list[Int] = Field(description="Direction the water flows toward, degrees true.")
    signedKn: list[Num] = Field(description="Speed, + flooding (toward floodDeg), - ebbing.")
    events: list[CurrentEvent]


class TidesDay(TimeAxis):
    """DFO predictions on a 15-minute axis from local 00:00 to the next local 00:00 inclusive (97 frames)."""

    stations: list[TideStation] = Field(description="Every DFO_TIDE_STATIONS station, in config order.")
    current: TidalCurrent | None = Field(description="DFO_CURRENT_STATION; null when it cannot be read.")
    credit: str


class WeatherParts(BaseModel):
    atmosphere: str = Field(description='"ok", "no_data" or "weather_unavailable".')
    marine: str = Field(description='"ok", "no_data" or "weather_unavailable".')
    wide: str = Field(description='"ok", "no_data" or "weather_unavailable".')


class WeatherGrid(BaseModel):
    """Cell index = iy * nLon + ix; iy = 0 is the south row, ix = 0 the west column."""

    lat0: float
    lon0: float
    dLat: float
    dLon: float
    nLat: int
    nLon: int


class Atmosphere(BaseModel):
    """Every field is [n][cells]."""

    windKn: list[list[Num]] = Field(description="Wind speed at 10 m, knots.")
    windFromDeg: list[list[Int]] = Field(description="Direction the wind blows from, degrees.")
    gustKn: list[list[Num]]
    pressureHpa: list[list[Num]] = Field(description="Mean sea-level pressure, hPa.")
    tempC: list[list[Num]] = Field(description="Air temperature at 2 m, °C.")
    cloudPct: list[list[Int]]
    precipMm: list[list[Num]] = Field(description="Precipitation in the preceding hour, mm.")
    visKm: list[list[Num]]


class MarinePoints(BaseModel):
    lat: list[float]
    lon: list[float]
    name: list[str]


class Marine(BaseModel):
    """Every field but `points` is [n][points]."""

    points: MarinePoints
    waveM: list[list[Num]] = Field(description="Significant wave height, m.")
    waveFromDeg: list[list[Int]] = Field(description="Direction the waves come from, degrees.")
    wavePeriodS: list[list[Num]]
    sstC: list[list[Num]] = Field(description="Sea surface temperature (model), °C.")
    currentKn: list[list[Num]] = Field(description="Surface current (model), knots.")
    currentTowardDeg: list[list[Int]] = Field(description="Direction the current flows toward, degrees.")


class WideWind(BaseModel):
    """Wind over OCEAN_AREA (47-51 N, 129.5-122 W) for the map zoomed out, 0.25° x 0.35° (replay
    and live). Every field but `grid` is [n][cells]."""

    grid: WeatherGrid
    windKn: list[list[Num]] = Field(description="Wind speed at 10 m, knots.")
    windFromDeg: list[list[Int]] = Field(description="Direction the wind blows from, degrees.")
    gustKn: list[list[Num]]


class WeatherDay(TimeAxis):
    """Hourly Open-Meteo model data: replay 25 frames (local 00:00 to the next 00:00 inclusive),
    live 10 frames (3 h before the current hour to 6 h after)."""

    parts: WeatherParts
    grid: WeatherGrid
    atmosphere: Atmosphere | None
    marine: Marine | None
    wide: WideWind | None = Field(
        description="Coarse wind for outside BRIDGE_BBOX (the kiosk uses `atmosphere` inside)."
    )
    credit: str


class WindStation(BaseModel):
    id: str = Field(description="ECCC climate ID.", examples=["1108291"])
    name: str = Field(examples=["Tsawwassen Ferry Terminal"])
    lat: float
    lon: float
    elevM: float | None = Field(description="Station elevation, m; null when unknown.")
    kn: list[Num] = Field(description="Mean wind speed, knots (0 = calm).")
    fromDeg: list[Int] = Field(description="Direction the wind blows from, degrees (0 = north); null when calm.")
    gustKn: list[Num] | None = Field(
        description="Gust, knots (live: highest wind in the 10 minutes); null for the whole station when it "
        "has none (always null in replay: climate-hourly has no gusts)."
    )


class WindObs(TimeAxis):
    """Measured wind at Environment and Climate Change Canada stations in 47-51 N, 129.5-122 W:
    replay hourly (25 frames, local 00:00 to the next 00:00 inclusive), live the last 3 h at 10
    minutes (19 frames, both ends)."""

    stations: list[WindStation] = Field(
        description="Stations with wind in the window, nearest to the ferry route (Active Pass) first."
    )
    credit: str


class StationSeries(BaseModel):
    """Only the keys the station has data for are sent. Each list has n values."""

    tempC: list[Num] | None = None
    sal: list[Num] | None = Field(None, description="Practical salinity, psu.")
    sigmaT: list[Num] | None = Field(None, description="Density minus 1000, kg/m³.")
    soundSpeed: list[Num] | None = Field(None, description="m/s.")
    o2MlL: list[Num] | None = Field(None, description="Dissolved oxygen (corrected), ml/l.")
    o2Sat: list[Num] | None = Field(None, description="Oxygen saturation, %.")
    chl: list[Num] | None = Field(None, description="Chlorophyll, µg/l.")
    turb: list[Num] | None = Field(None, description="Turbidity, NTU.")
    curEastMs: list[Num] | None = Field(None, description="Near-bottom current east, m/s.")
    curNorthMs: list[Num] | None = Field(None, description="Near-bottom current north, m/s.")
    windKn: list[Num] | None = Field(None, description="Mean wind speed in the step, knots.")
    windFromDeg: list[Int] | None = Field(
        None, description="Mean wind direction (from), degrees: speed-weighted, the plain vane mean when calm."
    )
    gustKn: list[Num] | None = Field(None, description="Highest wind sample in the step, knots.")
    baroHpa: list[Num] | None = None


class ObservatoryStation(BaseModel):
    code: str = Field(examples=["SCVIP"])
    name: str
    kind: Literal["node", "shore"]
    lat: float
    lon: float
    depthM: float | None = Field(description="Instrument depth, m; null on shore.")
    series: StationSeries


class Twdp(BaseModel):
    """The second ONC ferry (Tsawwassen - Duke Point), on its own 1-minute axis."""

    t0: str
    stepS: int
    n: int
    lat: list[Num]
    lon: list[Num]
    hdgDeg: list[Int] = Field(description="True heading, newest sample of the step.")
    cogDeg: list[Int] = Field(description="Course over ground, newest sample of the step.")
    sogKn: list[Num]
    sstC: list[Num]
    sal: list[Num]
    o2Sat: list[Num]
    chl: list[Num]
    turb: list[Num]
    cdom: list[Num]


class StationsDay(TimeAxis):
    """ONC observatories: replay 10-minute steps (144), live the last 3 h in 5-minute steps (36)."""

    parts: dict[str, str] = Field(
        description='Per station (SCVIP, SEVIP, IONA, TWDP): "ok", "no_data", "onc_auth" or "onc_down".'
    )
    stations: list[ObservatoryStation]
    twdp: Twdp | None
    credit: str


class CurrentsGrid(BaseModel):
    originLat: float = Field(description="Latitude of cell ix = 0, iy = 0.")
    originLon: float
    dxKm: float
    nx: int
    ny: int


class CurrentsCells(BaseModel):
    ix: list[int] = Field(description="Cells east of the origin.")
    iy: list[int] = Field(description="Cells north of the origin.")
    lat: list[float]
    lon: list[float]


class RadarSite(BaseModel):
    code: str = Field(examples=["VCOL"])
    name: str
    lat: float
    lon: float


class Currents(TimeAxis):
    """Hourly CODAR surface currents; live: the newest 6 hourly files."""

    unit: Literal["cm/s"]
    grid: CurrentsGrid
    cells: CurrentsCells = Field(description="Only cells with data in some frame.")
    u: list[list[Int]] = Field(description="[n][cells] eastward, cm/s.")
    v: list[list[Int]] = Field(description="[n][cells] northward, cm/s.")
    sites: list[RadarSite] = Field(description="Radar sites that contributed.")
    credit: str


class OceanLayer(BaseModel):
    """Model surface currents on a regular grid. `u` and `v` are [n][cells], int cm/s; null on land,
    outside the model or without data."""

    id: Literal["ssc-fine", "ssc-wide", "global"]
    label: str = Field(examples=["SalishSeaCast"])
    depth: str = Field(description="What depth the values stand for.", examples=["surface 0.5 m"])
    resolutionKm: float = Field(description="Nominal resolution of the data, km.")
    grid: WeatherGrid
    u: list[list[Int]] = Field(description="Eastward current, cm/s.")
    v: list[list[Int]] = Field(description="Northward current, cm/s.")


class OceanDay(TimeAxis):
    """Hourly model surface currents where the CODAR radar cannot see: replay 25 frames (local 00:00
    to the next 00:00 inclusive), live 10 (3 h before the current hour to 6 h after)."""

    parts: dict[str, str] = Field(
        description='`ssc` (SalishSeaCast) and `global` (Open-Meteo Marine): "ok", "no_data" or '
        '"ocean_unavailable".'
    )
    layers: list[OceanLayer] = Field(
        description="Finest first: ssc-fine, ssc-wide, global. A layer whose part failed is left out."
    )
    credit: str


# --- Replay


@router.get(
    "/{day}/tides",
    response_model=TidesDay,
    summary="Tides and the Active Pass current for a day",
    responses={
        404: {"description": "`day_not_found`: DFO has no predictions for that day."},
        422: {"description": "`day_out_of_range`: after tomorrow."},
        503: {"description": "`tides_unavailable`."},
    },
)
async def tides_day(day: date = DATE_PATH):
    """DFO IWLS predictions for a local day: water levels and high and low tides at every station
    of DFO_TIDE_STATIONS, and the Active Pass current (speed, set and signed flood/ebb). Any past
    day, today or tomorrow."""
    _check_not_after(day, 1)
    settings = get_settings()

    async def build() -> tuple[bytes, bool]:
        payload = await dfo.day(settings, day)
        complete = payload["current"] is not None and len(payload["stations"]) == len(settings.dfo_tide_stations)
        return to_bytes(payload), complete

    return await _replay("tides", day, build, TIDES_OPEN_TTL_S, lambda _: "tides_unavailable")


@router.get(
    "/{day}/weather",
    response_model=WeatherDay,
    summary="Hourly weather grid and sea state for a day",
    responses={
        404: {"description": "`day_not_found`: Open-Meteo has no data for that day."},
        422: {"description": "`day_out_of_range`: after tomorrow."},
        503: {"description": "`weather_unavailable`."},
    },
)
async def weather_day(day: date = DATE_PATH):
    """Open-Meteo historical forecasts for a local day: wind, gusts, pressure, temperature, cloud,
    precipitation and visibility on a BRIDGE_WX_GRID_DEG grid over BRIDGE_BBOX, waves, sea
    temperature and surface current at 14 points along the route and in the Strait, and wind and
    gusts on a 0.25° x 0.35° grid over 47-51 N, 129.5-122 W (`wide`). 25 hourly frames. A part that
    fails is null and named in `parts`."""
    _check_not_after(day, 1)
    settings = get_settings()

    async def build() -> tuple[bytes, bool]:
        payload, complete = await meteo_grid.day(settings, day)
        return to_bytes(payload), complete

    return await _replay("weather", day, build, WEATHER_TTL_S, lambda _: "weather_unavailable")


@router.get(
    "/{day}/stations",
    response_model=StationsDay,
    summary="ONC observatories and the second ferry for a day",
    responses={
        404: {"description": "`day_not_found`: ONC has no data from any station that day."},
        422: {"description": "`day_not_finished`: today or later."},
        503: {"description": "`onc_not_configured`, `onc_auth` or `onc_down`."},
    },
)
async def stations_day(day: date = DATE_PATH):
    """Deep water at the VENUS nodes SCVIP and SEVIP (temperature, salinity, density, sound speed,
    oxygen, chlorophyll, turbidity, near-bottom current), wind and pressure at Iona, in 10-minute
    steps, and the TWDP ferry's track and surface water every minute. Finished days only. The
    first read of a day takes a few seconds; then it is cached (and kept in Neon)."""
    if day >= _today():
        raise HTTPException(status_code=422, detail="day_not_finished")
    settings = get_settings()

    async def build() -> tuple[bytes, bool]:
        if not settings.onc_token:
            raise UpstreamError("not_configured")
        payload = await onc_stations.day(settings, day)
        return to_bytes(payload), _complete(payload)

    return await _replay("stations", day, build, settings.bridge_live_cache_s, _onc_detail)


@router.get(
    "/{day}/ocean",
    response_model=OceanDay,
    summary="Model surface currents for a day (where the radar cannot see)",
    responses={
        404: {"description": "`day_not_found`: neither model has that day."},
        422: {"description": "`day_out_of_range`: after tomorrow."},
        503: {"description": "`ocean_unavailable`."},
    },
)
async def ocean_day(
    day: date = DATE_PATH,
    stride: int = Query(
        1,
        ge=1,
        le=8,
        description="Keep every stride-th row and column of the SalishSeaCast grids (cells stride times "
        "larger; for the offline snapshot). 1 = full grids.",
    ),
):
    """Hourly surface currents (u east, v north, int cm/s) on three regular grids, finest first:
    SalishSeaCast (UBC's ~500 m model of the Salish Sea, top level 0.5 m) at 0.006° x 0.009° over
    BRIDGE_BBOX (`ssc-fine`) and 0.04° x 0.06° over 47-51 N, 126.5-122 W (`ssc-wide`), and the
    Mercator global model from Open-Meteo Marine at 0.25° x 0.35° over 47-51 N, 129.5-122 W
    (`global`). Days from 2007 to tomorrow (the last two days and tomorrow from the SalishSeaCast
    forecast until the hindcast has them). The first read of a day takes ~15 s (up to a minute while
    Open-Meteo calls are paced, e.g. with the weather of a new day); then it is cached (and kept in
    Neon)."""
    _check_not_after(day, 1)
    settings = get_settings()

    async def build() -> tuple[bytes, bool]:
        payload, complete = await ocean_model.day(settings, day)
        return to_bytes(payload), complete

    body, final = await _replay_body("ocean", day, build, OCEAN_TTL_S, lambda _: "ocean_unavailable")
    if stride > 1:
        body = ocean_model.coarsen(body, stride)
    return json_response(body, REPLAY_MAX_AGE_S if final else OCEAN_TTL_S)


@router.get(
    "/{day}/windobs",
    response_model=WindObs,
    summary="Measured wind at ECCC stations for a day (hourly)",
    responses={
        404: {"description": "`day_not_found`: ECCC has no wind for that day (yet: it publishes a day later)."},
        422: {"description": "`day_not_finished`: today or later."},
        503: {"description": "`windobs_unavailable`."},
    },
)
async def windobs_day(day: date = DATE_PATH):
    """Hourly wind (knots, direction from) measured at every Environment and Climate Change Canada
    station in 47-51 N, 129.5-122 W that reported wind that day (lightstations, automatic stations,
    airports), from ECCC's climate-hourly data: the measured counterpart of the `weather` model wind.
    No gusts in that source (`gustKn` null). Finished days only; ECCC publishes a day about one day
    later. Cached (and kept in Neon once ECCC has had three days to complete it)."""
    if day >= _today():
        raise HTTPException(status_code=422, detail="day_not_finished")

    async def build() -> tuple[bytes, bool]:
        payload, final = await eccc_wind.day(day)
        return to_bytes(payload), final

    return await _replay("windobs", day, build, WINDOBS_OPEN_TTL_S, lambda _: "windobs_unavailable")


async def _replay(
    dataset: str,
    day: date,
    build: Callable[[], Awaitable[tuple[bytes, bool]]],
    open_ttl_s: float,
    detail: Callable[[UpstreamError], str],
) -> Response:
    """The cached day as a response. A final day (ended, every part loaded) is sent with a one-day
    max-age; anything else (today, tomorrow, a failed part) with `open_ttl_s`."""
    body, final = await _replay_body(dataset, day, build, open_ttl_s, detail)
    return json_response(body, REPLAY_MAX_AGE_S if final else int(open_ttl_s))


async def _replay_body(
    dataset: str,
    day: date,
    build: Callable[[], Awaitable[tuple[bytes, bool]]],
    open_ttl_s: float,
    detail: Callable[[UpstreamError], str],
) -> tuple[bytes, bool]:
    """The cached day's payload and whether it is final; 404 `day_not_found` or 503 `detail(error)`."""
    try:
        return await bridge_cache.get(dataset, day, build, open_ttl_s)
    except UpstreamError as exc:
        if exc.code == "no_data":
            raise HTTPException(status_code=404, detail="day_not_found") from None
        raise HTTPException(status_code=503, detail=detail(exc)) from None


def _onc_detail(exc: UpstreamError) -> str:
    if exc.code == "not_configured":
        return "onc_not_configured"
    return onc_unavailable(exc).detail


def _complete(payload: dict[str, Any]) -> bool:
    return all(status == "ok" for status in payload["parts"].values())


def _today() -> date:
    return utc_now().astimezone(LOCAL_TZ).date()


def _check_not_after(day: date, days_ahead: int) -> None:
    if day > _today() + timedelta(days=days_ahead):
        raise HTTPException(status_code=422, detail="day_out_of_range")


# --- Live


@live_router.get(
    "/tides",
    response_model=TidesDay,
    summary="Today's tides and Active Pass current (bridge)",
    responses={503: {"description": "`tides_unavailable`."}},
)
async def tides_live():
    """The bridge `tides` dataset for today (local), with `mode` "live" and `now`."""
    settings = get_settings()
    now = utc_now()
    today = now.astimezone(LOCAL_TZ).date()

    async def build() -> bytes:
        payload = await dfo.day(settings, today)
        return to_bytes({**payload, "mode": "live", "now": iso_utc(now)})

    body = await _live_get(("tides", today), settings.bridge_live_cache_s, build, lambda _: "tides_unavailable")
    return json_response(body, int(settings.bridge_live_cache_s))


PARTIAL_RETRY_S = 60.0


@live_router.get(
    "/weather",
    response_model=WeatherDay,
    summary="Weather grid and sea state, 3 h back to 6 h ahead (bridge)",
    responses={503: {"description": "`weather_unavailable`."}},
)
async def weather_live():
    """Open-Meteo forecast at the replay's resolution (`atmosphere` on the BRIDGE_WX_GRID_DEG grid,
    `wide` 0.25° x 0.35°), hourly from 3 h before the current hour to 6 h after it (10 frames).
    `atmosphere` and `wide` are read once per 3 h (the free tier counts every grid point), `marine`
    once per hour. A part that failed, or came back without a variable, is asked again after
    10 minutes; the payload is rebuilt within a minute meanwhile."""
    settings = get_settings()
    now = utc_now()
    hour = int(now.timestamp()) // 3600
    degraded = False

    async def build() -> bytes:
        nonlocal degraded
        payload, complete = await meteo_grid.live(settings, now)
        degraded = not complete
        return to_bytes(payload)

    body = await _live_get(("weather", hour), WEATHER_TTL_S, build, lambda _: "weather_unavailable")
    # A part that failed (often a timeout) is retried within minutes, not kept for the rest of the hour.
    if degraded or any(status != "ok" for status in json.loads(body).get("parts", {}).values()):
        _live.expire_within(("weather", hour), PARTIAL_RETRY_S)
        return json_response(body, int(PARTIAL_RETRY_S))
    return json_response(body, WEATHER_TTL_S - int(now.timestamp()) % 3600)


@live_router.get(
    "/ocean",
    response_model=OceanDay,
    summary="Model surface currents, 3 h back to 6 h ahead (bridge)",
    responses={503: {"description": "`ocean_unavailable`: both models failed."}},
)
async def ocean_live():
    """The bridge `ocean` dataset from the SalishSeaCast forecast (read once per hour) and Open-Meteo
    Marine (once per 3 h), hourly from 3 h before the current hour to 6 h after it (10 frames). A
    part that failed is retried within a minute."""
    settings = get_settings()
    now = utc_now()
    hour = int(now.timestamp()) // 3600

    async def build() -> bytes:
        return to_bytes(await ocean_model.live(settings, now))

    body = await _live_get(("ocean", hour), OCEAN_TTL_S, build, lambda _: "ocean_unavailable")
    if any(status != "ok" for status in json.loads(body).get("parts", {}).values()):
        _live.expire_within(("ocean", hour), PARTIAL_RETRY_S)
        return json_response(body, int(PARTIAL_RETRY_S))
    return json_response(body, OCEAN_TTL_S - int(now.timestamp()) % 3600)


@live_router.get(
    "/windobs",
    response_model=WindObs,
    summary="Measured wind at ECCC stations, last 3 h (bridge)",
    responses={503: {"description": "`windobs_unavailable`."}},
)
async def windobs_live():
    """The last 3 h of the bridge `windobs` dataset at 10-minute steps (19 frames, both ends), from
    ECCC's real-time SWOB observations: 10-minute mean wind and the highest wind in those 10 minutes
    (`gustKn`). Stations that report every minute fill every frame, hourly ones every 6th. Cached for
    BRIDGE_LIVE_CACHE_S; a 10-minute mark that could not be read is asked again within a minute."""
    settings = get_settings()
    now = utc_now()
    axis = eccc_wind.live_axis(now)
    key = ("windobs", int(axis.time(axis.n - 1).timestamp()))
    partial = False

    async def build() -> bytes:
        nonlocal partial
        payload, complete = await eccc_wind.live(now)
        partial = not complete
        return to_bytes(payload)

    body = await _live_get(key, settings.bridge_live_cache_s, build, lambda _: "windobs_unavailable")
    if partial:
        _live.expire_within(key, PARTIAL_RETRY_S)
        return json_response(body, int(PARTIAL_RETRY_S))
    return json_response(body, int(settings.bridge_live_cache_s))


@live_router.get(
    "/stations",
    response_model=StationsDay,
    summary="ONC observatories and the second ferry, last 3 h (bridge)",
    responses={503: {"description": "`onc_not_configured`, `onc_auth`, `onc_down` or `stations_unavailable`."}},
)
async def stations_live():
    """The last 3 h of the bridge `stations` dataset in 5-minute steps (TWDP every minute), up to
    the last whole step. Cached for BRIDGE_LIVE_CACHE_S."""
    settings = onc_settings()
    now = utc_now()

    async def build() -> bytes:
        return to_bytes(await onc_stations.live(settings, now))

    key = ("stations", onc_stations.live_window_end(now))
    body = await _live_get(key, settings.bridge_live_cache_s, build, _onc_live_detail("stations"))
    return json_response(body, int(settings.bridge_live_cache_s))


@live_router.get(
    "/currents",
    response_model=Currents,
    summary="CODAR surface currents, newest 6 hours (bridge)",
    responses={503: {"description": "`onc_not_configured`, `onc_auth`, `onc_down` or `currents_unavailable`."}},
)
async def currents_live():
    """The newest hourly total-vector files of ONC's Strait of Georgia CODAR (they arrive about an
    hour late), on a 1 km grid, u and v in cm/s. 503 `currents_unavailable` when there is no file
    from the last 9 hours."""
    settings = onc_settings()
    now = utc_now()

    async def build() -> bytes:
        return to_bytes(await codar.live(settings, now))

    body = await _live_get(("currents",), settings.bridge_live_cache_s, build, _onc_live_detail("currents"))
    return json_response(body, int(settings.bridge_live_cache_s))


async def _live_get(
    key: tuple, ttl_s: float, build: Callable[[], Awaitable[bytes]], detail: Callable[[UpstreamError], str]
) -> bytes:
    try:
        return await _live.get(key, ttl_s, build)
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=detail(exc)) from None


def _onc_live_detail(dataset: str) -> Callable[[UpstreamError], str]:
    def detail(exc: UpstreamError) -> str:
        return f"{dataset}_unavailable" if exc.code == "no_data" else onc_unavailable(exc).detail

    return detail
