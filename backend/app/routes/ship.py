from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.http import UpstreamError
from app.sources import onc
from app.times import iso_local, iso_utc, utc_now

router = APIRouter(prefix="/api", tags=["live"])

Status = int | float | str | None

ONC_ERRORS = (
    "`onc_not_configured` (no ONC_TOKEN), `onc_auth` (token rejected), `onc_stale` (no position "
    "within ONC_MAX_POSITION_AGE_S) or `onc_down`."
)


class ShipRow(BaseModel):
    """One reading, with the same keys as the frontend `ShipRow`. Sensor values are null when
    missing or when they failed QC."""

    time: str = Field(description="NAV sample time, UTC.", examples=["2026-10-17T20:00:01.000Z"])
    time_local: str = Field(
        description="Same instant in America/Vancouver.", examples=["2026-10-17T13:00:01.000-07:00"]
    )
    latitude: float = Field(description="Degrees.", examples=[48.86])
    longitude: float = Field(description="Degrees.", examples=[-123.30])
    air_temperature: float | None = Field(description="°C.")
    barometric_pressure: float | None = Field(description="hPa.")
    cdom_fluorescence: float | None = Field(description="ppb.")
    chlorophyll: float | None = Field(description="µg/L.")
    conductivity: float | None = Field(description="S/m.")
    current: float | None = Field(description="Seawater pump current, A.")
    heading: float | None = Field(
        description="Direction the bow points, degrees true. NAV true heading; if it is missing, "
        "ORIENTATION magnetic_heading + MAGNETIC_DECLINATION_DEG (a rough fallback: that compass is "
        "off by up to ~60°). Unlike ship_course it stays steady at the berth.",
        examples=[316.8],
    )
    oxygen_saturation: float | None = Field(
        description="Dissolved oxygen as % of what the water holds at equilibrium with the air (OXYSENSOR)."
    )
    roll: float | None = Field(description="Degrees.")
    salinity: float | None = Field(description="PSU.")
    ship_course: float | None = Field(description="Course over ground, degrees true.")
    sound_speed: float | None = Field(description="Speed of sound in seawater, m/s.")
    speed_over_ground: float | None = Field(description="Knots (ONC reports m/s).")
    systemstatus: Status = Field(description="Seawater system on/off, as ONC reports it.")
    tank_level: float | None = Field(description="%.")
    tsg_temperature: float | None = Field(description="Sea surface temperature from the TSG, °C.")
    turbidity: float | None = Field(description="NTU.")
    valve_position_status: Status = Field(description="Valve position code, as ONC reports it.")


class ShipLatest(ShipRow):
    """`ShipRow` plus `source` and `age_s`. Sensor values are also null when they are more than
    ONC_MAX_SENSOR_AGE_S older than the NAV sample."""

    source: Literal["live"] = Field(description="Always `live` for this endpoint.")
    age_s: int = Field(description="Seconds since the NAV sample.", examples=[42])


class ShipHistory(BaseModel):
    """Recent rows, oldest first, at most one per step."""

    source: Literal["live"] = Field(description="Always `live` for this endpoint.")
    from_: str = Field(
        alias="from", description="Start of the first step, UTC.", examples=["2026-10-17T18:30:00Z"]
    )
    to: str = Field(
        description="End of the last step, UTC: the last multiple of `step_s` before the request.",
        examples=["2026-10-17T20:00:00Z"],
    )
    step_s: int = Field(description="Seconds per step.", examples=[5])
    rows: list[ShipRow] = Field(
        description="One per step that has a position, oldest first. Each holds the newest good sample "
        "of every sensor within its step, mapped and converted as in `/api/ship/latest` (`time` is the "
        "NAV sample time). Steps without a position are left out. A sensor is null when it has no good "
        "sample in the step, e.g. the water sensors while docked (the pump is off)."
    )


@router.get(
    "/ship/latest",
    response_model=ShipLatest,
    summary="Latest live ship readings",
    responses={503: {"description": ONC_ERRORS}},
)
async def ship_latest():
    """Newest readings from Ocean Networks Canada. Position, course, speed, heading and roll are
    cached for ONC_NAV_CACHE_S seconds, the other sensors for ONC_CACHE_S."""
    settings = onc_settings()
    try:
        snapshot = await onc.latest(settings)
    except UpstreamError as exc:
        raise onc_unavailable(exc) from None
    age_s = position_age_s(snapshot.position_time, settings)
    return {**row(snapshot), "source": "live", "age_s": max(0, round(age_s))}


@router.get(
    "/ship/history",
    response_model=ShipHistory,
    summary="Recent ship track and readings",
    responses={503: {"description": ONC_ERRORS + " `onc_stale` also when there are no rows."}},
)
async def ship_history(
    minutes: int = Query(90, ge=1, le=180, description="How far back to go. A crossing takes 79 to 87 min."),
    step: int = Query(5, ge=1, le=60, description="Seconds per row."),
):
    """The ship's track and readings over the last `minutes`, from Ocean Networks Canada, for the
    kiosk to fill in what it missed while idle (e.g. to rewind the current crossing); newer readings
    then come from `/api/ship/latest`. Cached for ONC_HISTORY_CACHE_S seconds per `minutes` and
    `step`."""
    settings = onc_settings()
    try:
        history = await onc.history(settings, minutes, step)
    except UpstreamError as exc:
        raise onc_unavailable(exc) from None
    position_age_s(history.rows[-1].position_time if history.rows else None, settings)
    return {
        "source": "live",
        "from": iso_utc(history.window.start),
        "to": iso_utc(history.window.end),
        "step_s": history.window.step_s,
        "rows": [row(r) for r in history.rows],
    }


def onc_settings() -> Settings:
    """The settings, or 503 `onc_not_configured` without ONC_TOKEN."""
    settings = get_settings()
    if not settings.onc_token:
        raise HTTPException(status_code=503, detail="onc_not_configured")
    return settings


def onc_unavailable(exc: UpstreamError) -> HTTPException:
    return HTTPException(status_code=503, detail="onc_auth" if exc.code == "auth" else "onc_down")


def position_age_s(taken: datetime | None, settings: Settings) -> float:
    """Seconds since `taken`, or 503 `onc_stale` when it is missing or older than ONC_MAX_POSITION_AGE_S."""
    age_s = (utc_now() - taken).total_seconds() if taken else None
    if taken is None or age_s > settings.onc_max_position_age_s:
        raise HTTPException(status_code=503, detail="onc_stale")
    return age_s


def row(snapshot: onc.Snapshot) -> dict:
    taken = snapshot.position_time
    return {**snapshot.values, "time": iso_utc(taken, "milliseconds"), "time_local": iso_local(taken, "milliseconds")}
