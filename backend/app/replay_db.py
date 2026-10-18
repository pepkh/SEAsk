"""Neon reads for the bridge replay: the recorded days and the own-ship columns of one day.

The recorded data never changes, so each payload is built once per process (`lru_cache`) and kept as
JSON bytes. Restart the API after rebuilding the tables (`scripts/build_*.py`).
"""

from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.frames import day_axis, day_bounds, rnd, to_bytes
from app.times import LOCAL_TZ, iso_utc
from db import get_engine

MS_TO_KN = 3600 / 1852

# Order of `zone` and `comfort` indexes in the ship payload (zone ids from frontend route.json).
ZONES = ("swartz-bay", "swanson-channel", "active-pass", "strait-of-georgia", "tsawwassen")
COMFORT_LEVELS = ("calm", "gentle", "rolly")

# (payload key, readings / readings_derived column, digits)
SHIP_COLUMNS = (
    ("lat", "r.latitude", 5),
    ("lon", "r.longitude", 5),
    ("cogDeg", "r.ship_course", 0),
    ("hdgDeg", "r.heading", 0),
    ("rollDeg", "r.roll", 1),
    ("rollStd", "d.roll_std_60s", 2),
    ("heaveM", "r.heave", 2),
    ("airC", "r.air_temperature", 1),
    ("baroHpa", "r.barometric_pressure", 1),
    ("sstC", "r.tsg_temperature", 2),
    ("sal", "r.salinity", 2),
    ("o2Sat", "r.oxygen_saturation", 1),
    ("chl", "r.chlorophyll", 2),
    ("turb", "r.turbidity", 2),
    ("cdom", "r.cdom_fluorescence", 2),
    ("sigmaT", "d.sigma_t", 2),
    ("frac", "d.route_fraction", 4),
)
# Integer columns: crossing id and the ONC QC flags (1 good, 3 probably bad, 4 bad, 9 missing).
SHIP_INT_COLUMNS = (
    ("crossing", "d.crossing_id"),
    ("tsgFlag", "d.tsg_flag"),
    ("oxyFlag", "d.oxygen_flag"),
    ("opticsFlag", "d.optics_flag"),
)


class DayNotFound(Exception):
    pass


def table_exists(conn: Connection, name: str) -> bool:
    return conn.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{name}"}).scalar()


def has_rows(conn: Connection, table: str, column: str, start: datetime, end: datetime) -> bool:
    if not table_exists(conn, table):
        return False
    sql = f"select exists (select 1 from {table} where {column} >= :start and {column} < :end)"
    return bool(conn.execute(text(sql), {"start": start, "end": end}).scalar())


def has_day(conn: Connection, table: str, d: date) -> bool:
    """For tables keyed by local `day` (date)."""
    if not table_exists(conn, table):
        return False
    return bool(conn.execute(text(f"select exists (select 1 from {table} where day = :d)"), {"d": d}).scalar())


def recorded_days(conn: Connection) -> list[date]:
    """Local dates that have own-ship readings."""
    first, last = conn.execute(text("select min(ts), max(ts) from readings")).one()
    if first is None:
        return []
    d, end = first.astimezone(LOCAL_TZ).date(), last.astimezone(LOCAL_TZ).date()
    days = []
    while d <= end:
        days.append(d)
        d += timedelta(days=1)
    return days


@lru_cache(maxsize=8)
def days_payload() -> bytes:
    """`/bridge/days`: each recorded day and which datasets it has."""
    with get_engine().connect() as conn:
        out = []
        for d in recorded_days(conn):
            start, end = day_bounds(d)
            out.append(
                {
                    "date": d.isoformat(),
                    "t0": iso_utc(start),
                    "t1": iso_utc(end),
                    "datasets": {
                        "ship": True,
                        # Read from upstream on demand (ONC, Open-Meteo, DFO), so any past day works.
                        "tides": True,
                        "weather": True,
                        "stations": True,
                        "ocean": True,
                        # Built offline into Neon by backend/scripts/build_*.py.
                        "currents": has_rows(conn, "codar_totals", "ts", start, end),
                        "traffic": has_rows(conn, "ais_positions", "ts", start, end),
                        "profiles": has_rows(conn, "adcp_profiles", "ts", start, end),
                        "sources": has_day(conn, "onc_inventory", d),
                    },
                }
            )
        climatology = table_exists(conn, "route_climatology")
    return to_bytes(
        {
            "days": out,
            "climatology": climatology,
            "live": {"ship": True, "currents": True, "ocean": True, "traffic": False, "weather": True, "stations": True, "tides": True},
        }
    )


def crossings(conn: Connection, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = conn.execute(
        text(
            "select id, direction, start_ts, end_ts from crossings "
            "where start_ts < :end and end_ts > :start order by id"
        ),
        {"start": start, "end": end},
    ).fetchall()
    return [{"id": r.id, "direction": r.direction, "start": iso_utc(r.start_ts), "end": iso_utc(r.end_ts)} for r in rows]


@lru_cache(maxsize=16)
def ship_payload(d: date, step_s: int) -> bytes:
    """`/bridge/{date}/ship`: own-ship columns for the local day, one row per `step_s` (the first
    reading in each step, so headings and roll are real samples, not averages)."""
    axis = day_axis(d, step_s)
    end = axis.time(axis.n)
    selected = ", ".join(
        [f"{col} as {key}" for key, col, _ in SHIP_COLUMNS]
        + [f"{col} as {key}" for key, col in SHIP_INT_COLUMNS]
        + ["d.speed_kn", "r.speed_over_ground", "d.zone", "d.comfort"]
    )
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                f"select distinct on (b) floor(extract(epoch from (r.ts - :t0)) / :step)::int as b, {selected} "
                "from readings r left join readings_derived d using (ts) "
                "where r.ts >= :t0 and r.ts < :end "
                "order by b, r.ts"
            ),
            {"t0": axis.t0, "end": end, "step": step_s},
        ).mappings().fetchall()
        if not rows:
            raise DayNotFound(d.isoformat())
        trips = crossings(conn, axis.t0, end)

    cols: dict[str, list[Any]] = {key: [None] * axis.n for key, _, _ in SHIP_COLUMNS}
    cols.update({key: [None] * axis.n for key, _ in SHIP_INT_COLUMNS})
    cols.update({k: [None] * axis.n for k in ("sogKn", "zone", "comfort")})
    zone_index = {z: i for i, z in enumerate(ZONES)}
    comfort_index = {c: i for i, c in enumerate(COMFORT_LEVELS)}
    for row in rows:
        i = row["b"]
        if not 0 <= i < axis.n:
            continue
        for key, _, digits in SHIP_COLUMNS:
            cols[key][i] = rnd(row[key.lower()], digits)
        for key, _ in SHIP_INT_COLUMNS:
            cols[key][i] = rnd(row[key.lower()], 0)
        kn = row["speed_kn"]
        if kn is None and row["speed_over_ground"] is not None:
            kn = row["speed_over_ground"] * MS_TO_KN
        cols["sogKn"][i] = rnd(kn, 1)
        cols["zone"][i] = zone_index.get(row["zone"])
        cols["comfort"][i] = comfort_index.get(row["comfort"])

    return to_bytes(
        {
            "dataset": "ship",
            "mode": "replay",
            "date": d.isoformat(),
            **axis.header(),
            "zones": list(ZONES),
            "comfortLevels": list(COMFORT_LEVELS),
            "crossings": trips,
            **cols,
            "credit": "Ocean Networks Canada (TWSB, BC Ferries)",
        }
    )
