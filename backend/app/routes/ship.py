from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.http import UpstreamError
from app.sources import onc
from app.times import iso_local, iso_utc, utc_now

router = APIRouter(prefix="/api", tags=["live"])

Status = int | float | str | None


class ShipLatest(BaseModel):
    """Same keys as the frontend `ShipRow`, plus `source` and `age_s`. Sensor values are null when
    missing, failed QC, or are more than ONC_MAX_SENSOR_AGE_S older than the NAV sample."""

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
    source: Literal["live"] = Field(description="Always `live` for this endpoint.")
    age_s: int = Field(description="Seconds since the NAV sample.", examples=[42])


@router.get(
    "/ship/latest",
    response_model=ShipLatest,
    summary="Latest live ship readings",
    responses={
        503: {
            "description": "`onc_not_configured` (no ONC_TOKEN), `onc_auth` (token rejected), "
            "`onc_stale` (no position within ONC_MAX_POSITION_AGE_S) or `onc_down`."
        }
    },
)
async def ship_latest():
    """Newest readings from Ocean Networks Canada. Position, course, speed, heading and roll are
    cached for ONC_NAV_CACHE_S seconds, the other sensors for ONC_CACHE_S."""
    settings = get_settings()
    if not settings.onc_token:
        raise HTTPException(status_code=503, detail="onc_not_configured")
    try:
        snapshot = await onc.latest(settings)
    except UpstreamError as exc:
        detail = "onc_auth" if exc.code == "auth" else "onc_down"
        raise HTTPException(status_code=503, detail=detail) from None

    taken = snapshot.position_time
    age_s = (utc_now() - taken).total_seconds() if taken else None
    if taken is None or age_s > settings.onc_max_position_age_s:
        raise HTTPException(status_code=503, detail="onc_stale")

    return {
        **snapshot.values,
        "time": iso_utc(taken, "milliseconds"),
        "time_local": iso_local(taken, "milliseconds"),
        "source": "live",
        "age_s": max(0, round(age_s)),
    }
