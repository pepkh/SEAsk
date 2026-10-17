"""Derived data of the recorded day (2026-08-17), from the tables built by
`scripts/build_derived.py`: per-crossing stats and water values along the route."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.times import iso_utc
from db import get_engine

router = APIRouter(tags=["recorded day"])

PROFILE_VALUES = ("sst", "salinity", "o2_sat", "chl", "turbidity", "sigma_t", "sst_anom", "salinity_anom", "o2_sat_anom")


class CrossingStats(BaseModel):
    id: int = Field(description="Trip number, as in `/trips`.", examples=[1])
    direction: Literal["swb_to_tsa", "tsa_to_swb"]
    start: str = Field(description="Departure time.", examples=["2026-08-17T14:01:23Z"])
    end: str = Field(description="Arrival time.", examples=["2026-08-17T15:26:02Z"])
    duration_min: float = Field(examples=[84.7])
    track_km: float = Field(description="Distance sailed, berth to berth.", examples=[46.2])
    avg_kn: float | None = Field(description="Average speed, knots.", examples=[17.7])
    max_kn: float | None = Field(examples=[21.2])
    dwell_before_min: float | None = Field(
        description="Minutes at the berth since the previous arrival. Null for the first crossing.", examples=[42.9]
    )
    active_pass_min: float = Field(description="Minutes in the Active Pass zone.", examples=[9.2])
    roll_std: float | None = Field(description="Standard deviation of roll while underway, degrees.", examples=[0.72])
    max_abs_roll: float | None = Field(description="Largest roll either way, degrees.", examples=[4.2])
    sst: float | None = Field(description="Mean sea surface temperature, °C.", examples=[14.42])
    salinity: float | None = Field(description="Mean salinity, psu.", examples=[28.3])
    salinity_min: float | None = Field(examples=[25.73])
    salinity_max: float | None = Field(examples=[30.79])
    o2_sat: float | None = Field(description="Mean oxygen saturation, %.", examples=[91.7])
    chl: float | None = Field(description="Mean chlorophyll, µg/l.", examples=[2.15])
    tsg_missing: bool = Field(description="True when the TSG (temperature, salinity) has no good data.")


class ProfileBin(BaseModel):
    bin: int = Field(description="0 at Swartz Bay.", examples=[0])
    fraction: float = Field(description="Middle of the bin as a route fraction, 0 Swartz Bay to 1 Tsawwassen.", examples=[0.0025])
    km: float = Field(description="Middle of the bin, km from Swartz Bay along the route line.", examples=[0.12])
    zone: str = Field(description="Zone id from `route.json`.", examples=["swartz-bay"])
    lat: float
    lon: float
    depth_m: float | None = Field(description="Water depth under the route line (GEBCO 2026), m. 0 on land cells.", examples=[18])
    n: int = Field(description="Underway samples (seconds) in the bin. Values are null when 0.", examples=[64])
    sst: float | None = Field(description="Sea surface temperature, °C.")
    salinity: float | None = Field(description="Salinity, psu.")
    o2_sat: float | None = Field(description="Oxygen saturation, %.")
    chl: float | None = Field(description="Chlorophyll, µg/l.")
    turbidity: float | None = Field(description="Turbidity, NTU.")
    sigma_t: float | None = Field(description="Surface density minus 1000, kg/m³.")
    sst_anom: float | None = Field(description="`sst` minus the mean over the whole route, °C.")
    salinity_anom: float | None = Field(description="`salinity` minus the mean over the whole route, psu.")
    o2_sat_anom: float | None = Field(description="`o2_sat` minus the mean over the whole route, %.")


class RouteProfile(BaseModel):
    crossing_id: int = Field(description="0 for all crossings together.", examples=[0])
    direction: Literal["swb_to_tsa", "tsa_to_swb"] | None = Field(description="Null for all crossings.")
    length_km: float = Field(description="Length of the route line.", examples=[46.4])
    bins: list[ProfileBin] = Field(description="Equal parts of the route line, Swartz Bay first.")


def rounded(value, digits: int = 3) -> float | None:
    return None if value is None else round(float(value), digits)


def profile(crossing_id: int, direction: str | None) -> dict:
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("select * from route_profile where crossing_id = :id order by bin"), {"id": crossing_id}
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found")
    last = rows[-1]
    return {
        "crossing_id": crossing_id,
        "direction": direction,
        "length_km": round(last.km / last.fraction, 2),
        "bins": [
            {
                "bin": r.bin,
                "fraction": round(r.fraction, 4),
                "km": round(r.km, 2),
                "zone": r.zone,
                "lat": round(r.lat, 5),
                "lon": round(r.lon, 5),
                "depth_m": rounded(r.depth_m, 0),
                "n": r.n,
                **{name: rounded(getattr(r, name)) for name in PROFILE_VALUES},
            }
            for r in rows
        ],
    }


@router.get("/trips/stats", response_model=list[CrossingStats], summary="Stats for every trip")
def trip_stats():
    """One row per trip of the day: distance, speed, time at the berth and in Active Pass, roll and
    mean water values."""
    with get_engine().connect() as conn:
        rows = conn.execute(text("select * from crossing_stats order by id")).mappings().fetchall()
    out = []
    for r in rows:
        row = {k: (rounded(v, 2) if isinstance(v, float) else v) for k, v in r.items()}
        row["start"], row["end"] = iso_utc(r["start_ts"]), iso_utc(r["end_ts"])
        out.append(row)
    return out


@router.get(
    "/trips/{trip_id}/profile",
    response_model=RouteProfile,
    summary="Water values along the route for one trip",
    responses={404: {"description": "Unknown trip id."}},
)
def trip_profile(trip_id: int):
    """Underway water values of one trip in equal parts of the route line, with the depth below."""
    with get_engine().connect() as conn:
        direction = conn.execute(text("select direction from crossings where id = :id"), {"id": trip_id}).scalar()
    if direction is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return profile(trip_id, direction)


@router.get("/route/profile", response_model=RouteProfile, summary="Water values along the route, all trips")
def route_profile():
    """All trips of the day together: the typical water values and the depth at each part of the
    route. The kiosk compares the live reading with the value here at the ship's route fraction."""
    return profile(0, None)
