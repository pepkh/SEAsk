"""Neon reads for the bridge datasets built offline: AIS traffic of a day and the route climatology.

`ais_vessels` / `ais_positions` come from scripts/build_ais.py and `route_climatology` from
scripts/build_climatology.py. The data never changes between rebuilds, so each payload is built
once per process (`lru_cache`) and kept as JSON bytes. Restart the API after rebuilding the tables.
"""

from datetime import date
from functools import lru_cache
from typing import Any

from sqlalchemy import text

from app.config import get_settings
from app.frames import day_bounds, rnd, to_bytes
from app.replay_db import DayNotFound, table_exists
from app.times import iso_utc
from db import get_engine

# Order of the `group` indexes in the traffic payload (ais_vessels.type_group values).
TRAFFIC_GROUPS = ("passenger", "cargo", "tanker", "tug", "fishing", "pleasure", "sailing", "hsc", "special", "other", "unknown")
TRAFFIC_CREDIT = "Ocean Networks Canada (Iona AIS receiver)"

CLIMATOLOGY_BINS = 200  # same bins as route_profile (scripts/build_derived.py BINS)
# (payload key, digits); the key is also route_climatology.var.
CLIMATOLOGY_VARS = (("sst", 2), ("sal", 2), ("o2Sat", 1), ("chl", 2), ("turb", 2))
CLIMATOLOGY_CREDIT = "Ocean Networks Canada (TWSB, BC Ferries)"


class WindowNotFound(Exception):
    pass


@lru_cache(maxsize=8)
def traffic_payload(d: date, step_s: int) -> bytes:
    """`/bridge/{date}/traffic`: every vessel's fixes in the local day, at most one per `step_s`
    per vessel (the last fix in each step), `t` in whole seconds from the day's start."""
    start, end = day_bounds(d)
    with get_engine().connect() as conn:
        if not table_exists(conn, "ais_positions"):
            raise DayNotFound(d.isoformat())
        rows = conn.execute(
            text(
                "select distinct on (mmsi, b) mmsi, b, ts, lat, lon, sog_kn, cog_deg, heading_deg from ("
                "  select *, floor(extract(epoch from (ts - :t0)) / :step)::int as b from ais_positions "
                "  where ts >= :t0 and ts < :t1"
                ") p order by mmsi, b, ts desc"
            ),
            {"t0": start, "t1": end, "step": step_s},
        ).fetchall()
        if not rows:
            raise DayNotFound(d.isoformat())
        vessels = conn.execute(
            text(
                "select mmsi, name, callsign, ship_type, type_group, length_m, beam_m, role "
                "from ais_vessels where mmsi = any(:ids) order by mmsi"
            ),
            {"ids": sorted({r.mmsi for r in rows})},
        ).fetchall()

    tracks: dict[int, dict[str, list]] = {}
    for r in rows:  # ordered by mmsi, then time
        track = tracks.setdefault(r.mmsi, {"t": [], "lat": [], "lon": [], "sogKn": [], "cogDeg": [], "hdgDeg": []})
        track["t"].append(int((r.ts - start).total_seconds()))
        track["lat"].append(rnd(r.lat, 5))
        track["lon"].append(rnd(r.lon, 5))
        track["sogKn"].append(rnd(r.sog_kn, 1))
        track["cogDeg"].append(rnd(r.cog_deg, 0))
        track["hdgDeg"].append(rnd(r.heading_deg, 0))

    group_index = {g: i for i, g in enumerate(TRAFFIC_GROUPS)}
    out = []
    for v in vessels:
        out.append(
            {
                "mmsi": v.mmsi,
                "name": v.name,
                "callsign": v.callsign,
                "group": group_index.get(v.type_group, group_index["unknown"]),
                "type": v.ship_type,
                "lengthM": rnd(v.length_m, 0),
                "beamM": rnd(v.beam_m, 0),
                "role": v.role,
                **tracks[v.mmsi],
            }
        )
    south, north, west, east = get_settings().bridge_bbox
    return to_bytes(
        {
            "dataset": "traffic",
            "mode": "replay",
            "date": d.isoformat(),
            "t0": iso_utc(start),
            "t1": iso_utc(end),
            "stepS": step_s,
            "bbox": [south, north, west, east],
            "groups": list(TRAFFIC_GROUPS),
            "vessels": out,
            "credit": TRAFFIC_CREDIT,
        }
    )


@lru_cache(maxsize=4)
def climatology_payload(window: str) -> bytes:
    """`/route/climatology`: per route bin and variable, the multi-year mean, 10th and 90th
    percentiles and number of minutes (null where there is no data), and the years used."""
    with get_engine().connect() as conn:
        if not table_exists(conn, "route_climatology"):
            raise WindowNotFound(window)
        rows = conn.execute(
            text('select bin, var, mean, p10, p90, n, years from route_climatology where "window" = :w'),
            {"w": window},
        ).fetchall()
    if not rows:
        raise WindowNotFound(window)

    digits = dict(CLIMATOLOGY_VARS)
    out: dict[str, dict[str, list[Any]]] = {
        key: {stat: [None] * CLIMATOLOGY_BINS for stat in ("mean", "p10", "p90", "n")} for key, _ in CLIMATOLOGY_VARS
    }
    years: set[int] = set()
    for r in rows:
        if r.var not in out or not 0 <= r.bin < CLIMATOLOGY_BINS or not r.n:
            continue
        v = out[r.var]
        v["mean"][r.bin] = rnd(r.mean, digits[r.var])
        v["p10"][r.bin] = rnd(r.p10, digits[r.var])
        v["p90"][r.bin] = rnd(r.p90, digits[r.var])
        v["n"][r.bin] = r.n
        years.update(r.years or [])
    return to_bytes(
        {
            "dataset": "climatology",
            "window": window,
            "years": sorted(years),
            "nBins": CLIMATOLOGY_BINS,
            "vars": out,
            "credit": CLIMATOLOGY_CREDIT,
        }
    )
