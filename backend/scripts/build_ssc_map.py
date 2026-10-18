"""Build app/sources/ssc_map.json: where each cell of the bridge `ocean` grids reads the models.

The API (`app/sources/ocean_model.py`) puts SalishSeaCast (UBC NEMO model, ~500 m, on a rotated
curvilinear 898 x 398 grid) onto regular lat/lon grids. This script does the geometry once:

- the model grid: T-point latitude/longitude and the land masks from the ERDDAP dataset
  `ubcSSn2DMeshMaskV21-08` (glamt, gphit, tmaskutil, umaskutil, vmaskutil; ~4 MB gzipped);
- the grid angle at each T point: the direction of gridX, from the T points on either side
  (i-1 -> i+1, one-sided at the edges), in local east/north metres. The model's x-axis is about
  29 degrees counter-clockwise from east around the Strait of Georgia; gridY is 90 degrees further.
  The API rotates grid-relative (u, v) to true east/north with it:
      east = u cos(a) - v sin(a),   north = u sin(a) + v cos(a);
- for each cell of `ssc-fine` (BRIDGE_BBOX at 0.006 x 0.009 deg) the nearest sea T point within
  FINE_MAX_KM. u and v sit on the cell faces (u east, v north), so the API averages the two faces
  around the T point; the boxes it downloads include the west and south neighbours;
- for each cell of `ssc-wide` (47-51 N, 126.5-122 W at 0.04 x 0.06 deg) the nearest sea T point
  within WIDE_MAX_KM on the lattice the API downloads (every WIDE_STRIDE-th row and column), whose
  east and north faces are water too: the API reads the face values there without averaging
  (half a model cell is nothing at 4 km);
- the index boxes to download, one per layer by default (ssc-wide strided). --fine-boxes /
  --wide-boxes N split a layer into up to N bands of rows, each with its own column range, which
  skips some land and corners of the rotated grid (-20%) but costs more requests, and ERDDAP spends
  ~7 s per request whatever its size;
- the cells of the `global` grid (47-51 N, 129.5-122 W at 0.25 x 0.35 deg) that Open-Meteo Marine
  has currents for (one request of every cell, `cell_selection=sea`): the API asks only for those,
  which saves the free-tier budget. Skipped with --no-global (then the API asks for every cell).

Run from backend/ (needs requirements-scripts.txt):
    .venv/bin/python scripts/build_ssc_map.py --dry-run
    .venv/bin/python scripts/build_ssc_map.py            # writes app/sources/ssc_map.json
    .venv/bin/python scripts/build_ssc_map.py --mesh mesh.nc   # a mesh file downloaded before
"""

import argparse
import json
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
import xarray as xr
from scipy.spatial import cKDTree

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import OCEAN_AREA, get_settings  # noqa: E402

OUT = BACKEND / "app" / "sources" / "ssc_map.json"
ERDDAP = "https://salishsea.eos.ubc.ca/erddap/griddap"
MESH_DATASET = "ubcSSn2DMeshMaskV21-08"
MESH_VARS = ("glamt", "gphit", "tmaskutil", "umaskutil", "vmaskutil")
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
EARTH_KM = 6371.0
KM_PER_DEG = 111.32

FINE_STEP = (0.006, 0.009)  # dLat, dLon: about 0.67 x 0.66 km
FINE_MAX_KM = 0.7
WIDE_AREA = (47.0, 51.0, -126.5, -122.0)  # south, north, west, east
WIDE_STEP = (0.04, 0.06)  # about 4.4 x 4.4 km
WIDE_MAX_KM = 3.0
WIDE_STRIDE = 4  # model rows/columns between downloaded points (~2 km)
GLOBAL_STEP = (0.25, 0.35)
GLOBAL_PROBE_HOUR = "2026-08-17T19:00"


def grid_header(south: float, north: float, west: float, east: float, step: tuple[float, float]) -> dict:
    d_lat, d_lon = step
    return {
        "lat0": south,
        "lon0": west,
        "dLat": d_lat,
        "dLon": d_lon,
        "nLat": round((north - south) / d_lat) + 1,
        "nLon": round((east - west) / d_lon) + 1,
    }


def cell_centres(grid: dict) -> tuple[np.ndarray, np.ndarray]:
    """Latitude and longitude of every cell, in cell order (iy * nLon + ix, iy 0 south)."""
    iy, ix = np.meshgrid(np.arange(grid["nLat"]), np.arange(grid["nLon"]), indexing="ij")
    lat = grid["lat0"] + iy.ravel() * grid["dLat"]
    lon = grid["lon0"] + ix.ravel() * grid["dLon"]
    return lat, lon


def xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Points on a sphere of radius EARTH_KM: chord distances are km (= arc at these scales)."""
    la, lo = np.radians(lat), np.radians(lon)
    return EARTH_KM * np.column_stack((np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)))


def load_mesh(path: Path | None) -> xr.Dataset:
    if path is not None:
        return xr.open_dataset(path).load()
    query = ",".join(f"{v}[0][0:897][0:397]" for v in MESH_VARS)
    url = f"{ERDDAP}/{MESH_DATASET}.nc?{query}"
    print(f"Downloading {MESH_DATASET} ({', '.join(MESH_VARS)}) ...")
    started = time.monotonic()
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    print(f"  {len(r.content) / 1e6:.1f} MB in {time.monotonic() - started:.1f} s")
    with tempfile.TemporaryDirectory() as tmp:
        mesh = Path(tmp) / "mesh.nc"
        mesh.write_bytes(r.content)
        with xr.open_dataset(mesh) as ds:
            return ds.load()


def grid_angle(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Angle of the gridX direction, radians counter-clockwise from east, at every T point."""
    lat_e = np.empty_like(lat)
    lon_e = np.empty_like(lon)
    lat_w = np.empty_like(lat)
    lon_w = np.empty_like(lon)
    lat_e[:, :-1], lon_e[:, :-1] = lat[:, 1:], lon[:, 1:]
    lat_e[:, -1], lon_e[:, -1] = lat[:, -1], lon[:, -1]
    lat_w[:, 1:], lon_w[:, 1:] = lat[:, :-1], lon[:, :-1]
    lat_w[:, 0], lon_w[:, 0] = lat[:, 0], lon[:, 0]
    east = (lon_e - lon_w) * np.cos(np.radians(lat))
    north = lat_e - lat_w
    return np.arctan2(north, east)


def nearest(grid: dict, lat: np.ndarray, lon: np.ndarray, ok: np.ndarray, max_km: float):
    """For each grid cell: the nearest model point where `ok`, within `max_km` (else -1)."""
    jj, ii = np.nonzero(ok)
    tree = cKDTree(xyz(lat[jj, ii], lon[jj, ii]))
    c_lat, c_lon = cell_centres(grid)
    dist, k = tree.query(xyz(c_lat, c_lon), distance_upper_bound=max_km)
    found = np.isfinite(dist)
    cells = np.nonzero(found)[0]
    return cells, jj[k[found]], ii[k[found]], dist[found]


def bands(points: set[tuple[int, int]], max_bands: int) -> list[list[int]]:
    """Split the rows of `points` into at most `max_bands` contiguous bands, each with its own
    column range, so the boxes [j0..j1] x [i0..i1] cover every point with the least area."""
    rows = sorted({j for j, _ in points})
    lo = {j: min(i for jj, i in points if jj == j) for j in rows}
    hi = {j: max(i for jj, i in points if jj == j) for j in rows}
    r0, r1 = rows[0], rows[-1]
    span = list(range(r0, r1 + 1))  # rows without points still belong to a band

    def area(a: int, b: int) -> int:
        cols = [j for j in span[a : b + 1] if j in lo]
        if not cols:
            return 0
        return (b - a + 1) * (max(hi[j] for j in cols) - min(lo[j] for j in cols) + 1)

    n = len(span)
    # best[k][b]: least area covering rows 0..b with k bands; cut[k][b]: start of the last band.
    inf = float("inf")
    best = [[inf] * n for _ in range(max_bands + 1)]
    cut = [[0] * n for _ in range(max_bands + 1)]
    for b in range(n):
        best[1][b] = area(0, b)
    for k in range(2, max_bands + 1):
        for b in range(n):
            for a in range(1, b + 1):
                cost = best[k - 1][a - 1] + area(a, b)
                if cost < best[k][b]:
                    best[k][b], cut[k][b] = cost, a
    k = min(range(1, max_bands + 1), key=lambda m: best[m][n - 1])
    out, b = [], n - 1
    while k >= 1:
        a = cut[k][b] if k > 1 else 0
        cols = [j for j in span[a : b + 1] if j in lo]
        if cols:  # the box spans the rows that have points (on the stride lattice)
            out.append([cols[0], cols[-1], min(lo[j] for j in cols), max(hi[j] for j in cols)])
        b, k = a - 1, k - 1
    return sorted(out)


def layer(layer_id, grid, cells, jj, ii, angle, stride, unstagger, max_km, boxes) -> dict:
    return {
        "id": layer_id,
        "grid": grid,
        "maxKm": max_km,
        "stride": stride,
        "unstagger": unstagger,
        "boxes": boxes,
        "cell": cells.tolist(),
        "j": jj.tolist(),
        "i": ii.tolist(),
        # cos and sin of the grid angle, x 10000
        "cos": np.rint(np.cos(angle[jj, ii]) * 10000).astype(int).tolist(),
        "sin": np.rint(np.sin(angle[jj, ii]) * 10000).astype(int).tolist(),
    }


def global_sea_cells(grid: dict) -> list[int] | None:
    """Cells where Open-Meteo Marine has a current (sea), from one request of every cell."""
    lat, lon = cell_centres(grid)
    sea = []
    for start in range(0, len(lat), 100):
        chunk = range(start, min(start + 100, len(lat)))
        params = {
            "latitude": ",".join(f"{lat[k]:.4f}" for k in chunk),
            "longitude": ",".join(f"{lon[k]:.4f}" for k in chunk),
            "hourly": "ocean_current_velocity",
            "timezone": "GMT",
            "start_hour": GLOBAL_PROBE_HOUR,
            "end_hour": GLOBAL_PROBE_HOUR,
            "cell_selection": "sea",
        }
        try:
            r = requests.get(MARINE_URL, params=params, timeout=60)
            r.raise_for_status()
        except requests.RequestException as exc:
            print(f"  Open-Meteo failed ({type(exc).__name__}); the API will ask for every global cell")
            return None
        body = r.json()
        for k, loc in zip(chunk, body if isinstance(body, list) else [body], strict=True):
            if any(v is not None for v in loc["hourly"]["ocean_current_velocity"]):
                sea.append(k)
    return sea


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print the summary; do not write the map.")
    parser.add_argument("--mesh", type=Path, help=f"A local {MESH_DATASET} .nc file instead of downloading it.")
    parser.add_argument("--fine-boxes", type=int, default=1, help="Most download boxes for ssc-fine (default 1).")
    parser.add_argument("--wide-boxes", type=int, default=1, help="Most download boxes for ssc-wide (default 1).")
    parser.add_argument(
        "--no-global", action="store_true", help="Do not probe Open-Meteo for the global sea cells."
    )
    args = parser.parse_args()

    ds = load_mesh(args.mesh)
    lat = ds.gphit.values[0].astype(float)
    lon = ds.glamt.values[0].astype(float)
    tmask = ds.tmaskutil.values[0] == 1
    umask = ds.umaskutil.values[0] == 1
    vmask = ds.vmaskutil.values[0] == 1
    angle = grid_angle(lat, lon)
    ny, nx = lat.shape
    print(f"Model grid {ny} x {nx}, {tmask.sum()} sea T points; grid angle {np.degrees(angle[tmask]).min():.1f} "
          f"to {np.degrees(angle[tmask]).max():.1f} deg (median {np.degrees(np.median(angle[tmask])):.1f})")

    # ssc-fine: any sea T point with a west and south neighbour (for the face averages).
    south, north, west, east = get_settings().bridge_bbox
    fine_grid = grid_header(south, north, west, east, FINE_STEP)
    ok = tmask.copy()
    ok[0, :] = False
    ok[:, 0] = False
    cells, jj, ii, dist = nearest(fine_grid, lat, lon, ok, FINE_MAX_KM)
    needed = set(zip(jj.tolist(), ii.tolist()))
    needed |= {(j, i - 1) for j, i in needed} | {(j - 1, i) for j, i in needed}
    fine_boxes = bands(needed, args.fine_boxes)
    fine = layer("ssc-fine", fine_grid, cells, jj, ii, angle, 1, True, FINE_MAX_KM, fine_boxes)
    _summary("ssc-fine", fine_grid, cells, dist, fine_boxes, 1)

    # ssc-wide: lattice points (every WIDE_STRIDE-th row and column) with water on the east and north faces.
    wide_grid = grid_header(*WIDE_AREA, WIDE_STEP)
    lattice = np.zeros_like(tmask)
    lattice[::WIDE_STRIDE, ::WIDE_STRIDE] = True
    cells, jj, ii, dist = nearest(wide_grid, lat, lon, tmask & umask & vmask & lattice, WIDE_MAX_KM)
    wide_boxes = bands(set(zip(jj.tolist(), ii.tolist())), args.wide_boxes)
    wide = layer("ssc-wide", wide_grid, cells, jj, ii, angle, WIDE_STRIDE, False, WIDE_MAX_KM, wide_boxes)
    _summary("ssc-wide", wide_grid, cells, dist, wide_boxes, WIDE_STRIDE)

    global_grid = grid_header(*OCEAN_AREA, GLOBAL_STEP)
    n_global = global_grid["nLat"] * global_grid["nLon"]
    sea = None if args.no_global else global_sea_cells(global_grid)
    if sea is not None:
        print(f"global: {global_grid['nLat']} x {global_grid['nLon']} = {n_global} cells, {len(sea)} sea "
              f"({100 * len(sea) / n_global:.0f}%) per Open-Meteo Marine")

    out = {
        "version": 1,
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "mesh": MESH_DATASET,
        "layers": [fine, wide],
        "global": {"grid": global_grid, "cells": sea},
    }
    body = json.dumps(out, separators=(",", ":")).encode()
    if args.dry_run:
        print(f"Dry run: would write {len(body) / 1e3:.0f} kB to {OUT.relative_to(BACKEND)}")
        return
    OUT.write_bytes(body)
    print(f"Wrote {len(body) / 1e3:.0f} kB to {OUT.relative_to(BACKEND)}")


def _summary(name: str, grid: dict, cells: np.ndarray, dist: np.ndarray, boxes: list, stride: int) -> None:
    total = grid["nLat"] * grid["nLon"]
    points = sum(((j1 - j0) // stride + 1) * ((i1 - i0) // stride + 1) for j0, j1, i0, i1 in boxes)
    print(
        f"{name}: {grid['nLat']} x {grid['nLon']} = {total} cells, {len(cells)} mapped "
        f"({100 * len(cells) / total:.0f}% sea), distance median {np.median(dist):.2f} km, max {dist.max():.2f} km"
    )
    print(f"  download boxes (gridY, gridX, stride {stride}): "
          + ", ".join(f"[{j0}:{j1}][{i0}:{i1}]" for j0, j1, i0, i1 in boxes)
          + f" = {points} points per time")


if __name__ == "__main__":
    main()
