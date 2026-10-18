"""Bridge datasets built offline into Neon: AIS vessel traffic and the multi-year route climatology."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app import replay_history
from app.frames import json_response
from app.replay_db import DayNotFound
from app.routes.bridge import DATE_PATH, REPLAY_MAX_AGE_S, neon_unavailable

router = APIRouter(tags=["bridge replay"])

NEON_ERRORS = {503: {"description": "`neon_not_configured` or `replay_unavailable`."}}


class TrafficVessel(BaseModel):
    """One vessel's fixes, in time order. The track lists all have the same length."""

    mmsi: int
    name: str | None
    callsign: str | None
    group: int = Field(description="Index into `groups`.")
    type: int | None = Field(description="AIS ship type code (e.g. 60 passenger, 70 cargo, 52 tug).")
    lengthM: int | None
    beamM: int | None
    role: Literal["own", "twdp"] | None = Field(
        description="`own` = our ferry (ONC TWSB), `twdp` = the ONC Tsawwassen - Duke Point ferry."
    )
    t: list[int] = Field(description="Seconds from `t0` of each fix (ONC Iona receive time).")
    lat: list[float]
    lon: list[float]
    sogKn: list[float | None] = Field(description="Speed over ground, knots.")
    cogDeg: list[int | None] = Field(description="Course over ground, degrees true.")
    hdgDeg: list[int | None] = Field(description="True heading, degrees.")


class TrafficDay(BaseModel):
    """AIS vessel traffic of a local day inside `bbox`. Fixes are the last per minute per vessel (one
    per 10 min while a vessel stays put), then at most one per `stepS`."""

    dataset: Literal["traffic"]
    mode: Literal["replay"]
    date: str
    t0: str = Field(examples=["2026-08-17T07:00:00Z"])
    t1: str = Field(examples=["2026-08-18T07:00:00Z"])
    stepS: int
    bbox: list[float] = Field(description="[south, north, west, east], degrees.")
    groups: list[str] = Field(description="Names for the vessels' `group` indexes.")
    vessels: list[TrafficVessel]
    credit: str


class ClimatologyStats(BaseModel):
    """`nBins` values each, bin 0 at Swartz Bay; null where the bin has no data."""

    mean: list[float | None]
    p10: list[float | None] = Field(description="10th percentile.")
    p90: list[float | None] = Field(description="90th percentile.")
    n: list[int | None] = Field(description="Underway minutes with a value, all years together.")


class ClimatologyVars(BaseModel):
    sst: ClimatologyStats = Field(description="Sea surface temperature (TSG), °C.")
    sal: ClimatologyStats = Field(description="Salinity, psu.")
    o2Sat: ClimatologyStats = Field(description="Oxygen saturation, %.")
    chl: ClimatologyStats = Field(description="Chlorophyll, µg/l.")
    turb: ClimatologyStats = Field(description="Turbidity, NTU.")


class Climatology(BaseModel):
    dataset: Literal["climatology"]
    window: str = Field(examples=["aug"])
    years: list[int] = Field(description="Years with data in the window.")
    nBins: int = Field(description="Equal parts of the route line, as `/route/profile`.")
    vars: ClimatologyVars
    credit: str


@router.get(
    "/bridge/{day}/traffic",
    response_model=TrafficDay,
    summary="AIS vessel traffic for a whole day",
    responses={404: {"description": "`day_not_found`: no AIS fixes that day."}, **NEON_ERRORS},
)
def traffic_day(
    day: date = DATE_PATH,
    step: int = Query(60, ge=60, le=600, multiple_of=60, description="Seconds: at most one fix per vessel per step (60, 120 or 300)."),
):
    """Every vessel seen by the Ocean Networks Canada AIS receiver at Iona in the bridge box, with
    name, type group, size and its track. About 1 MB gzipped at the default step."""
    try:
        body = replay_history.traffic_payload(day, step)
    except DayNotFound:
        raise HTTPException(status_code=404, detail="day_not_found") from None
    except (RuntimeError, SQLAlchemyError) as exc:
        raise neon_unavailable(exc) from None
    return json_response(body, REPLAY_MAX_AGE_S)


@router.get(
    "/route/climatology",
    response_model=Climatology,
    summary="Usual water values along the route (multi-year)",
    responses={404: {"description": "`window_not_found`: no climatology for that window."}, **NEON_ERRORS},
)
def route_climatology(
    window: str = Query("aug", max_length=16, description="Window of the year, e.g. `aug` (Aug 3-31, 2020-2025)."),
):
    """Multi-year sea temperature, salinity, oxygen saturation, chlorophyll and turbidity of the
    ferry (ONC TWSB) per route bin, as the mean with the 10th-90th percentile band: what is usual
    here at this time of year."""
    try:
        body = replay_history.climatology_payload(window)
    except replay_history.WindowNotFound:
        raise HTTPException(status_code=404, detail="window_not_found") from None
    except (RuntimeError, SQLAlchemyError) as exc:
        raise neon_unavailable(exc) from None
    return json_response(body, REPLAY_MAX_AGE_S)
