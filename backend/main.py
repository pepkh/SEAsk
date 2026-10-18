from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.config import get_settings
from app.http import start_client, stop_client
from app.routes import bridge, bridge_history, bridge_ocean, bridge_upstream, derived, ship, status, tides, weather
from db import get_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    """One shared HTTP client for all upstream APIs."""
    start_client(get_settings().http_timeout_s)
    try:
        yield
    finally:
        await stop_client()


app = FastAPI(
    title="SEAsk API",
    description=(
        "BC Ferries trips between Tsawwassen and Swartz Bay on 2026-08-17, plus live data under "
        "`/api`: ship readings (Ocean Networks Canada), weather (OpenWeatherMap), waves "
        "(Open-Meteo Marine) and tides and currents (DFO IWLS). All UTC timestamps are ISO 8601 "
        "ending in `Z`."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)
# The bridge sends whole days of data (up to ~1 MB of JSON); gzip makes that 3-5 times smaller.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.include_router(ship.router)
app.include_router(weather.router)
app.include_router(tides.router)
app.include_router(status.router)
# Before the `/trips/{trip_id}` route below, so `/trips/stats` is not read as a trip id.
app.include_router(derived.router)
app.include_router(bridge.router)
app.include_router(bridge_upstream.router)
app.include_router(bridge_upstream.live_router)
app.include_router(bridge_ocean.router)
app.include_router(bridge_history.router)


class Point(BaseModel):
    t: str = Field(description="Time of the reading.", examples=["2026-08-17T14:02:00Z"])
    lat: float = Field(description="Latitude in degrees.", examples=[48.69])
    lon: float = Field(description="Longitude in degrees.", examples=[-123.41])


class Trip(BaseModel):
    id: int = Field(description="Trip number, in order of departure.", examples=[1])
    direction: Literal["swb_to_tsa", "tsa_to_swb"] = Field(
        description="`swb_to_tsa` is Swartz Bay to Tsawwassen. `tsa_to_swb` is the reverse."
    )
    start: str = Field(description="Departure time.", examples=["2026-08-17T14:01:23.065000Z"])
    end: str = Field(description="Arrival time.", examples=["2026-08-17T15:26:02.066000Z"])
    duration_s: int = Field(description="Trip length in seconds.", examples=[5079])


class TripDetail(Trip):
    points: list[Point] = Field(description="Route points in time order. The last one is the arrival point.")


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def trip_dict(row) -> dict:
    return {
        "id": row.id,
        "direction": row.direction,
        "start": iso_utc(row.start_ts),
        "end": iso_utc(row.end_ts),
        "duration_s": int((row.end_ts - row.start_ts).total_seconds()),
    }


@app.get("/")
def home():
    return {"message": "SEAsk backend is running!"}


@app.get("/trips", response_model=list[Trip], summary="List trips")
def list_trips():
    """All trips of the day, ordered by id. Use these ids with `/trips/{trip_id}`."""
    with get_engine().connect() as conn:
        rows = conn.execute(
            text("select id, direction, start_ts, end_ts from crossings order by id")
        ).fetchall()
    return [trip_dict(r) for r in rows]


@app.get(
    "/trips/{trip_id}",
    response_model=TripDetail,
    summary="Get one trip with its route points",
    responses={404: {"description": "Unknown trip id."}},
)
def get_trip(
    trip_id: int,
    interval: int = Query(60, ge=1, le=1800, description="Seconds between points."),
):
    """One trip with its route points. Get valid ids from `/trips`."""
    with get_engine().connect() as conn:
        trip = conn.execute(
            text("select id, direction, start_ts, end_ts from crossings where id = :id"),
            {"id": trip_id},
        ).fetchone()
        if trip is None:
            raise HTTPException(status_code=404, detail="Trip not found")

        rows = conn.execute(
            text(
                "select distinct on (floor(extract(epoch from ts) / :interval)) "
                "ts, latitude, longitude "
                "from readings "
                "where ts between :start and :end and latitude is not null and longitude is not null "
                "order by floor(extract(epoch from ts) / :interval), ts"
            ),
            {"interval": interval, "start": trip.start_ts, "end": trip.end_ts},
        ).fetchall()
        arrival = conn.execute(
            text("select ts, latitude, longitude from readings where ts = :end"),
            {"end": trip.end_ts},
        ).fetchone()

    if arrival is not None and (not rows or rows[-1].ts != arrival.ts):
        rows = [*rows, arrival]

    return {
        **trip_dict(trip),
        "points": [{"t": iso_utc(r.ts), "lat": r.latitude, "lon": r.longitude} for r in rows],
    }
