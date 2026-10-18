"""Bridge datasets built offline into Neon: CODAR surface currents, ADCP current profiles and the ONC inventory of a day."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app import replay_ocean
from app.frames import json_response
from app.replay_db import DayNotFound
from app.routes.bridge import DATE_PATH, REPLAY_MAX_AGE_S, neon_unavailable

router = APIRouter(tags=["bridge replay"])

NEON_ERRORS = {503: {"description": "`neon_not_configured` or `replay_unavailable`."}}


# --- currents


class CodarGrid(BaseModel):
    originLat: float = Field(description="Latitude of cell ix=0, iy=0 (the south-west corner cell).")
    originLon: float
    dxKm: float = Field(description="Cell size, km (square cells).")
    nx: int = Field(description="Cells west to east.")
    ny: int = Field(description="Cells south to north.")


class CodarCells(BaseModel):
    """Cells with good data that day, one entry per column of `u` and `v`."""

    ix: list[int] = Field(description="Cells east of the grid origin.")
    iy: list[int] = Field(description="Cells north of the grid origin.")
    lat: list[float]
    lon: list[float]


class CodarSite(BaseModel):
    code: str = Field(examples=["VATK"])
    name: str = Field(examples=["Point Atkinson"])
    lat: float
    lon: float


class CurrentsDay(BaseModel):
    """Hourly surface currents: `u[i][j]` is cell `j` at `t0 + i * stepS`."""

    dataset: Literal["currents"]
    mode: Literal["replay", "live"]
    date: str
    t0: str
    stepS: int = Field(examples=[3600])
    n: int = Field(description="25: both local midnights included.", examples=[25])
    unit: Literal["cm/s"]
    grid: CodarGrid
    cells: CodarCells
    u: list[list[int | None]] = Field(description="Eastward surface current, cm/s, `[n][cells]`.")
    v: list[list[int | None]] = Field(description="Northward surface current, cm/s, `[n][cells]`.")
    sites: list[CodarSite] = Field(description="The four CODAR SeaSonde radar sites.")
    credit: str


# --- profiles


class ProfileNode(BaseModel):
    code: str = Field(examples=["SCVIP"])
    name: str
    lat: float
    lon: float
    depthM: float = Field(description="ADCP depth, m.")
    binDepthM: list[float] = Field(description="Bin depths below the surface, m, shallow first.")
    u: list[list[float | None]] = Field(description="Eastward current, m/s, `[n][bins]`.")
    v: list[list[float | None]] = Field(description="Northward current, m/s, `[n][bins]`.")


class ProfilesDay(BaseModel):
    """10-min current profiles: `u[i][k]` is bin `k` over `[t0 + i * stepS, t0 + (i + 1) * stepS)`."""

    dataset: Literal["profiles"]
    mode: Literal["replay"]
    date: str
    t0: str
    stepS: int = Field(examples=[600])
    n: int = Field(examples=[144])
    nodes: list[ProfileNode]
    credit: str


# --- sources


class SourceItem(BaseModel):
    location: str = Field(examples=["SCVIP"])
    locationName: str | None
    lat: float | None
    lon: float | None
    depthM: float | None
    category: str = Field(description="ONC device category code.", examples=["CTD"])
    kind: Literal["scalar", "archive", "product"]
    sensors: list[str] = Field(
        description="scalar: sensor codes with values; archive: `extension:count` per file type; product: data product codes."
    )
    status: Literal["ok", "no_data"]
    deviceCode: str | None
    deviceName: str | None
    deployedFrom: str | None = Field(description="Start of the device's deployment there.")
    usedBy: Literal["ship", "stations", "currents", "traffic", "profiles"] | None = Field(
        description="The bridge dataset that reads this location, category and kind."
    )


class SourcesDay(BaseModel):
    dataset: Literal["sources"]
    mode: Literal["replay"]
    date: str
    items: list[SourceItem]
    credit: str


# --- routes


def _serve(build, day: date):
    try:
        body = build(day)
    except DayNotFound:
        raise HTTPException(status_code=404, detail="day_not_found") from None
    except (RuntimeError, SQLAlchemyError) as exc:
        raise neon_unavailable(exc) from None
    return json_response(body, REPLAY_MAX_AGE_S)


@router.get(
    "/bridge/{day}/currents",
    response_model=CurrentsDay,
    summary="CODAR surface currents for a whole day",
    responses={404: {"description": "`day_not_found`: no CODAR data that day."}, **NEON_ERRORS},
)
def currents_day(day: date = DATE_PATH):
    """Hourly surface currents on the 1 km grid of the Ocean Networks Canada Strait of Georgia
    CODAR radars (quality flags good and probably good only). The radars do not see Swanson
    Channel or most of Active Pass."""
    return _serve(replay_ocean.currents_payload, day)


@router.get(
    "/bridge/{day}/profiles",
    response_model=ProfilesDay,
    summary="ADCP current profiles for a whole day",
    responses={404: {"description": "`day_not_found`: no ADCP profiles that day."}, **NEON_ERRORS},
)
def profiles_day(day: date = DATE_PATH):
    """Currents through the water column every 10 minutes from the upward-looking 150 kHz ADCPs
    at the Strait of Georgia Central (SCVIP) and East (SEVIP) nodes. Bins near the surface, where
    the side lobes see the surface echo, are left out."""
    return _serve(replay_ocean.profiles_payload, day)


@router.get(
    "/bridge/{day}/sources",
    response_model=SourcesDay,
    summary="ONC sources around the route that day",
    responses={404: {"description": "`day_not_found`: no inventory for that day."}, **NEON_ERRORS},
)
def sources_day(day: date = DATE_PATH):
    """Every Ocean Networks Canada location and device category in the bridge area that day, with
    its sensors, archive files and data products, whether it had data, and which bridge dataset
    uses it."""
    return _serve(replay_ocean.sources_payload, day)
