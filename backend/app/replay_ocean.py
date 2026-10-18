"""Neon reads for the bridge replay of the ocean datasets built offline: CODAR surface currents
(`scripts/build_currents.py`), ADCP current profiles (`scripts/build_adcp.py`) and the ONC
inventory of a day (`scripts/onc_inventory.py`).

As in `replay_db`, each payload is built once per process (`lru_cache`) and kept as JSON bytes.
Restart the API after rebuilding the tables.
"""

from datetime import date
from functools import lru_cache
from typing import Any

from sqlalchemy import text

from app.frames import day_axis, rnd, to_bytes
from app.replay_db import DayNotFound, table_exists
from app.times import iso_utc
from db import get_engine

# ONC quality flags served: 1 good, 2 probably good. The CODAR file of 2026-08-16..18 uses only
# 1 (cleaned velocity set), 4 (bad: only the raw fit) and 9 (missing); see build_currents.py.
CODAR_GOOD_FLAGS = (1, 2)
# The four 25 MHz CODAR SeaSondes of the ONC Strait of Georgia array (SOGCS).
CODAR_SITES = (
    {"code": "VATK", "name": "Point Atkinson", "lat": 49.3301, "lon": -123.2644},
    {"code": "VCOL", "name": "Westshore Coal Terminal", "lat": 49.0181, "lon": -123.1719},
    {"code": "VGPT", "name": "Georgina Point", "lat": 48.8737, "lon": -123.2910},
    {"code": "VSPT", "name": "Iona Spit", "lat": 49.2055, "lon": -123.2633},
)
# The upward-looking 150 kHz ADCPs (ONC deployments of RDIADCP150WH17457 and RDIADCP150WH8580).
ADCP_NODES = (
    {"code": "SCVIP", "name": "Strait of Georgia Central", "lat": 49.04003, "lon": -123.42551, "depthM": 294},
    {"code": "SEVIP", "name": "Strait of Georgia East", "lat": 49.04307, "lon": -123.31677, "depthM": 165},
)
ONC_CREDIT = "Ocean Networks Canada"


@lru_cache(maxsize=8)
def currents_payload(d: date) -> bytes:
    """`/bridge/{date}/currents`: hourly CODAR surface currents of the local day (both midnights),
    good and probably-good cells only, in integer cm/s."""
    axis = day_axis(d, 3600, include_end=True)
    with get_engine().connect() as conn:
        if not table_exists(conn, "codar_totals"):
            raise DayNotFound(d.isoformat())
        rows = conn.execute(
            text(
                "select ts, cell_id, u, v from codar_totals "
                "where ts >= :t0 and ts < :end and flag = any(:flags) order by ts, cell_id"
            ),
            {"t0": axis.t0, "end": axis.time(axis.n), "flags": list(CODAR_GOOD_FLAGS)},
        ).fetchall()
        if not rows:
            raise DayNotFound(d.isoformat())
        ids = sorted({r.cell_id for r in rows})
        cells = conn.execute(
            text("select cell_id, ix, iy, lat, lon from codar_cells where cell_id = any(:ids) order by cell_id"),
            {"ids": ids},
        ).fetchall()
        grid = conn.execute(
            text(
                "select max(ix) + 1 as nx, max(iy) + 1 as ny, "
                "max(lat) filter (where ix = 0 and iy = 0) as lat0, max(lon) filter (where ix = 0 and iy = 0) as lon0, "
                "max(x_km) filter (where ix = 1 and iy = 0) - max(x_km) filter (where ix = 0 and iy = 0) as dx "
                "from codar_cells"
            )
        ).one()

    column = {c.cell_id: i for i, c in enumerate(cells)}
    u: list[list[int | None]] = [[None] * len(cells) for _ in range(axis.n)]
    v: list[list[int | None]] = [[None] * len(cells) for _ in range(axis.n)]
    for r in rows:
        i = axis.nearest(r.ts)
        if i is None:
            continue
        j = column[r.cell_id]
        u[i][j] = rnd(r.u * 100, 0) if r.u is not None else None
        v[i][j] = rnd(r.v * 100, 0) if r.v is not None else None

    return to_bytes(
        {
            "dataset": "currents",
            "mode": "replay",
            "date": d.isoformat(),
            **axis.header(),
            "unit": "cm/s",
            "grid": {
                "originLat": rnd(grid.lat0, 5),
                "originLon": rnd(grid.lon0, 5),
                "dxKm": rnd(grid.dx, 3),
                "nx": grid.nx,
                "ny": grid.ny,
            },
            "cells": {
                "ix": [c.ix for c in cells],
                "iy": [c.iy for c in cells],
                "lat": [rnd(c.lat, 5) for c in cells],
                "lon": [rnd(c.lon, 5) for c in cells],
            },
            "u": u,
            "v": v,
            "sites": list(CODAR_SITES),
            "credit": "Ocean Networks Canada (Strait of Georgia CODAR)",
        }
    )


@lru_cache(maxsize=8)
def profiles_payload(d: date) -> bytes:
    """`/bridge/{date}/profiles`: 10-min ADCP current profiles of the local day per node, bins
    shallow first (side-lobe bins near the surface already removed by build_adcp.py)."""
    axis = day_axis(d, 600)
    with get_engine().connect() as conn:
        if not table_exists(conn, "adcp_profiles"):
            raise DayNotFound(d.isoformat())
        rows = conn.execute(
            text(
                "select node, ts, bin_depth_m, u, v from adcp_profiles "
                "where ts >= :t0 and ts < :end order by node, bin_depth_m, ts"
            ),
            {"t0": axis.t0, "end": axis.time(axis.n)},
        ).fetchall()
    if not rows:
        raise DayNotFound(d.isoformat())

    nodes = []
    for meta in ADCP_NODES:
        node_rows = [r for r in rows if r.node == meta["code"]]
        if not node_rows:
            continue
        depths = sorted({r.bin_depth_m for r in node_rows})
        column = {depth: j for j, depth in enumerate(depths)}
        u: list[list[float | None]] = [[None] * len(depths) for _ in range(axis.n)]
        v: list[list[float | None]] = [[None] * len(depths) for _ in range(axis.n)]
        for r in node_rows:
            i = axis.index(r.ts)  # ts is the start of the 600 s window
            if i is None:
                continue
            u[i][column[r.bin_depth_m]] = rnd(r.u, 3)
            v[i][column[r.bin_depth_m]] = rnd(r.v, 3)
        nodes.append({**meta, "binDepthM": [rnd(depth, 1) for depth in depths], "u": u, "v": v})

    return to_bytes(
        {
            "dataset": "profiles",
            "mode": "replay",
            "date": d.isoformat(),
            **axis.header(),
            "nodes": nodes,
            "credit": ONC_CREDIT,
        }
    )


@lru_cache(maxsize=8)
def sources_payload(d: date) -> bytes:
    """`/bridge/{date}/sources`: every ONC location and device category in the bridge bbox that
    day, with what it had (scalar sensors, archive files, data products) and which dataset uses it."""
    with get_engine().connect() as conn:
        if not table_exists(conn, "onc_inventory"):
            raise DayNotFound(d.isoformat())
        rows = conn.execute(
            text(
                "select location, location_name, lat, lon, depth_m, category, kind, sensors, status, "
                "device_code, device_name, deployed_from, used_by from onc_inventory "
                "where day = :d order by location, category, kind"
            ),
            {"d": d},
        ).fetchall()
    if not rows:
        raise DayNotFound(d.isoformat())

    items: list[dict[str, Any]] = [
        {
            "location": r.location,
            "locationName": r.location_name,
            "lat": rnd(r.lat, 5),
            "lon": rnd(r.lon, 5),
            "depthM": rnd(r.depth_m, 1),
            "category": r.category,
            "kind": r.kind,
            "sensors": list(r.sensors or []),
            "status": r.status,
            "deviceCode": r.device_code,
            "deviceName": r.device_name,
            "deployedFrom": iso_utc(r.deployed_from) if r.deployed_from else None,
            "usedBy": r.used_by,
        }
        for r in rows
    ]
    return to_bytes({"dataset": "sources", "mode": "replay", "date": d.isoformat(), "items": items, "credit": ONC_CREDIT})
