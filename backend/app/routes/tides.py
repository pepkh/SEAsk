from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import get_settings
from app.http import UpstreamError
from app.routes.weather import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from app.sources import dfo
from app.times import utc_now

router = APIRouter(prefix="/api", tags=["live"])


class TideStation(BaseModel):
    code: str = Field(description="DFO station code.", examples=["07270"])
    name: str = Field(description="DFO station name.", examples=["Swartz Bay"])


class TideExtreme(BaseModel):
    type: Literal["high", "low"]
    h: float = Field(description="Height above chart datum, m.", examples=[3.24])
    at: str = Field(description="Local time, HH:MM.", examples=["13:24"])


class CurrentEvent(BaseModel):
    type: Literal["slack", "flood", "ebb"] = Field(
        description="`slack` (turn of the current; DFO's weak-and-variable periods count as slack), "
        "`flood` or `ebb` (maximum flood or ebb)."
    )
    at: str = Field(description="Local time, HH:MM.", examples=["06:53"])
    kn: float = Field(description="Speed, knots (0 at slack).", examples=[3.6])


class Current(BaseModel):
    """Predictions for DFO_CURRENT_STATION. Speeds are knots (DFO reports knots)."""

    station: str = Field(examples=["Active Pass"])
    speedKn: float = Field(description="Speed now (nearest 15-minute value), knots.", examples=[3.1])
    towardDeg: int | None = Field(
        description="Direction the water flows toward now, degrees true.", examples=[45]
    )
    flooding: bool | None = Field(
        description="True when the current now runs in the station's flood direction (45° true, "
        "NE toward the Strait of Georgia, at Active Pass)."
    )
    maxFloodKn: float | None = Field(description="Strongest flood today, knots.", examples=[3.6])
    maxEbbKn: float | None = Field(description="Strongest ebb today, knots.", examples=[2.4])
    nextSlack: str | None = Field(description="Next slack today, local HH:MM.", examples=["10:40"])
    events: list[CurrentEvent] = Field(description="Today's slacks and maxima, in time order.")


class Tides(BaseModel):
    station: TideStation = Field(description="Nearest of DFO_TIDE_STATIONS.")
    date: str = Field(description="Local date (America/Vancouver).", examples=["2026-10-17"])
    stepMin: int = Field(description="Minutes between `heights` values.", examples=[15])
    heights: list[float | None] = Field(
        description="Predicted water level above chart datum, m, from local 00:00 to the next "
        "00:00 every stepMin (97 values; 93 or 101 on DST days). Null for a missing value."
    )
    extremes: list[TideExtreme] = Field(description="Today's high and low tides, in time order.")
    current: Current | None = Field(description="Null when the current station is unavailable.")


@router.get(
    "/tides",
    response_model=Tides,
    summary="Today's tide and the Active Pass current",
    responses={
        422: {"description": "lat/lon missing or outside the Salish Sea box."},
        503: {"description": "`tides_unavailable`: the tide predictions could not be read."},
    },
)
async def tides(
    lat: float = Query(ge=LAT_MIN, le=LAT_MAX, description="Latitude, 47.5 to 50.5.", examples=[48.689]),
    lon: float = Query(ge=LON_MIN, le=LON_MAX, description="Longitude, -125.5 to -121.5.", examples=[-123.41]),
):
    """Predictions from DFO's Integrated Water Level System (no key) for the local day: the water
    level at the nearest tide station and the current at DFO_CURRENT_STATION. Each day is cached
    for DFO_CACHE_S; the "now" values are worked out per request."""
    try:
        return await dfo.tides(get_settings(), lat, lon, utc_now())
    except UpstreamError:
        raise HTTPException(status_code=503, detail="tides_unavailable") from None
