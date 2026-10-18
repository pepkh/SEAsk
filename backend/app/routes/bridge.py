"""Data for the captain's bridge screen.

- `/bridge/{date}/{dataset}`: a whole recorded local day, built once and cached, for the kiosk to
  scrub through (replay).
- `/api/bridge/{dataset}`: the same shapes over a window around now (live).

Every dataset is column-oriented on a regular time axis (`t0`, `stepS`, `n`) with `null` for a
missing value, so the kiosk reads the value at any time by index. Times are ISO UTC ending in `Z`.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app import replay_db
from app.frames import json_response

router = APIRouter(prefix="/bridge", tags=["bridge replay"])

# A replayed day never changes, but tables get rebuilt while we develop: one day, not `immutable`.
REPLAY_MAX_AGE_S = 86400

DATE_PATH = Path(description="Local date (America/Vancouver), YYYY-MM-DD.", examples=["2026-08-17"])


class DayDatasets(BaseModel):
    ship: bool
    tides: bool
    weather: bool
    stations: bool
    ocean: bool = Field(description="Model surface currents (SalishSeaCast, global), read on demand.")
    currents: bool = Field(description="CODAR surface currents (scripts/build_currents.py).")
    traffic: bool = Field(description="AIS vessel traffic (scripts/build_ais.py).")
    profiles: bool = Field(description="ADCP current profiles (scripts/build_adcp.py).")
    sources: bool = Field(description="ONC inventory of the day (scripts/onc_inventory.py).")


class RecordedDay(BaseModel):
    date: str = Field(examples=["2026-08-17"])
    t0: str = Field(description="Local midnight, UTC.", examples=["2026-08-17T07:00:00Z"])
    t1: str = Field(description="Next local midnight, UTC.", examples=["2026-08-18T07:00:00Z"])
    datasets: DayDatasets


class LiveDatasets(BaseModel):
    ship: bool
    currents: bool
    ocean: bool
    traffic: bool = Field(description="False: ONC publishes AIS only as daily files.")
    weather: bool
    stations: bool
    tides: bool


class Days(BaseModel):
    days: list[RecordedDay]
    climatology: bool = Field(description="True when `/route/climatology` has data.")
    live: LiveDatasets


class CrossingRef(BaseModel):
    id: int
    direction: Literal["swb_to_tsa", "tsa_to_swb"]
    start: str
    end: str


class ShipDay(BaseModel):
    """Own-ship columns. Every list has `n` values, one per `stepS` from `t0`."""

    dataset: Literal["ship"]
    mode: Literal["replay", "live"]
    date: str
    t0: str
    stepS: int
    n: int
    zones: list[str] = Field(description="Names for the `zone` indexes (route.json zone ids).")
    comfortLevels: list[str] = Field(description="Names for the `comfort` indexes.")
    crossings: list[CrossingRef]
    lat: list[float | None]
    lon: list[float | None]
    sogKn: list[float | None] = Field(description="Speed over ground, knots.")
    cogDeg: list[int | None] = Field(description="Course over ground, degrees true.")
    hdgDeg: list[int | None] = Field(description="True heading (NAV), degrees.")
    rollDeg: list[float | None]
    rollStd: list[float | None] = Field(description="Standard deviation of roll over 60 s, degrees.")
    heaveM: list[float | None]
    airC: list[float | None]
    baroHpa: list[float | None]
    sstC: list[float | None] = Field(description="Sea surface temperature (TSG), °C.")
    sal: list[float | None] = Field(description="Salinity, psu.")
    o2Sat: list[float | None] = Field(description="Oxygen saturation, %.")
    chl: list[float | None] = Field(description="Chlorophyll, µg/l.")
    turb: list[float | None] = Field(description="Turbidity, NTU.")
    cdom: list[float | None] = Field(description="CDOM fluorescence, ppb.")
    sigmaT: list[float | None] = Field(description="Surface density minus 1000, kg/m³.")
    frac: list[float | None] = Field(description="Route fraction, 0 Swartz Bay to 1 Tsawwassen.")
    crossing: list[int | None] = Field(description="Crossing id while underway on a crossing.")
    zone: list[int | None]
    comfort: list[int | None]
    tsgFlag: list[int | None] = Field(description="ONC QC flag of the TSG: 1 good, 3 probably bad, 4 bad.")
    oxyFlag: list[int | None]
    opticsFlag: list[int | None]
    credit: str


def neon_unavailable(exc: Exception) -> HTTPException:
    detail = "neon_not_configured" if isinstance(exc, RuntimeError) else "replay_unavailable"
    return HTTPException(status_code=503, detail=detail)


@router.get(
    "/days",
    response_model=Days,
    summary="Recorded days and their datasets",
    responses={503: {"description": "`neon_not_configured` or `replay_unavailable`."}},
)
def days():
    """The days the bridge can replay, and which datasets each one has."""
    try:
        body = replay_db.days_payload()
    except (RuntimeError, SQLAlchemyError) as exc:
        raise neon_unavailable(exc) from None
    return json_response(body, 300)


@router.get(
    "/{day}/ship",
    response_model=ShipDay,
    summary="Own ship for a whole day",
    responses={
        404: {"description": "`day_not_found`: no readings that day."},
        503: {"description": "`neon_not_configured` or `replay_unavailable`."},
    },
)
def ship_day(
    day: date = DATE_PATH,
    step: int = Query(10, ge=1, le=60, description="Seconds between rows (the first reading of each step)."),
):
    """Position, motion, water and air readings and the derived crossing, zone, comfort and QC flags
    of the ferry (ONC TWSB) for a local day. About 0.25 MB gzipped at the default step."""
    try:
        body = replay_db.ship_payload(day, step)
    except replay_db.DayNotFound:
        raise HTTPException(status_code=404, detail="day_not_found") from None
    except (RuntimeError, SQLAlchemyError) as exc:
        raise neon_unavailable(exc) from None
    return json_response(body, REPLAY_MAX_AGE_S)
