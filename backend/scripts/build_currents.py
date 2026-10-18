"""Build the CODAR surface-current tables in Neon from the ONC Strait of Georgia CODAR NetCDF.

Reads the hourly 1 km "Totals_Clean" grid of the four 25 MHz SeaSondes (VATK, VCOL, VGPT, VSPT;
ONC location SOGCS) tracked in frontend/ref/ and keeps the whole file's time range (2026-08-16
00Z to 2026-08-18 23Z, which covers the replay day 2026-08-17 local). Replaces only these, in one
transaction:

- codar_cells: every cell of the km grid. `ix`/`iy` count east/north from the south-west corner
  of the grid (cell_id = iy * nx + ix); `x_km`/`y_km` are the file's distances from the CODAR grid
  origin (49.0675 N, -123.3689 W).
- codar_totals: one row per hour and cell that has a velocity. `u`/`v` in m/s (the file is in
  cm/s). The file's quality flags are 1 (good: the cleaned `u`/`v` are set), 4 (bad: only the raw
  least-squares fit `u_raw`/`v_raw` exists, sometimes) and 9 (missing, not stored). Flag-1 rows
  hold the cleaned velocity, flag-4 rows the raw one; the API serves flags 1-2 only.

Run from backend/:  .venv/bin/python scripts/build_currents.py [--inspect] [--dry-run]
Needs NEON_URL in backend/.env (not for --inspect or --dry-run).
"""

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_derived import copy_frame
from export_sample_data import FRONTEND, MS_TO_KN, ROUTE_FILE, cumulative_m, point_along

from db import get_engine

NC_FILE = (
    FRONTEND
    / "ref/StraitofGeorgia_StraitofGeorgiaCODARSystem_OceanographicRadarSystem_20260816T000000.000Z_20260818T230000.000Z-Totals_Clean.nc"
)
# Velocity units the script knows, as a factor to m/s. Anything else stops the build.
TO_MS = {"cm/s": 0.01, "cm s-1": 0.01, "cm.s-1": 0.01, "m/s": 1.0, "m s-1": 1.0, "m.s-1": 1.0}
GOOD_FLAGS = (1, 2)  # ONC: 1 good, 2 probably good
STORED_FLAGS = (1, 2, 3, 4)  # 9 = missing value: nothing to store
# Route coverage: a route point is covered when a cell within COVER_KM has good data in at least
# COVER_SHARE of the hours. The route is sampled every ROUTE_STEP_M.
COVER_KM = 1.5
COVER_SHARE = 0.5
ROUTE_STEP_M = 100

CELLS_DDL = """
create table codar_cells (
  cell_id integer primary key,
  ix smallint not null,
  iy smallint not null,
  x_km real not null,
  y_km real not null,
  lat double precision not null,
  lon double precision not null,
  unique (ix, iy)
);
comment on table codar_cells is 'ONC Strait of Georgia CODAR (SOGCS) 1 km total-current grid. Built by backend/scripts/build_currents.py.';
comment on column codar_cells.cell_id is 'iy * nx + ix.';
comment on column codar_cells.ix is 'Cells east of the grid''s west edge (0 = west).';
comment on column codar_cells.iy is 'Cells north of the grid''s south edge (0 = south).';
comment on column codar_cells.x_km is 'Easting from the CODAR grid origin (49.0675 N, -123.3689 W), km.';
comment on column codar_cells.y_km is 'Northing from the CODAR grid origin, km.';
"""

TOTALS_DDL = """
create table codar_totals (
  ts timestamptz not null,
  cell_id integer not null references codar_cells (cell_id),
  u real,
  v real,
  u_err real,
  v_err real,
  gdop real,
  n_radials smallint,
  flag smallint not null,
  primary key (ts, cell_id)
);
comment on table codar_totals is 'Hourly CODAR surface currents (ONC SOGCS Totals_Clean NetCDF). Built by backend/scripts/build_currents.py.';
comment on column codar_totals.u is 'Eastward surface current, m/s. Cleaned value for flags 1-2, raw least-squares fit for flag 4.';
comment on column codar_totals.v is 'Northward surface current, m/s.';
comment on column codar_totals.u_err is 'Eastward variance from the radial geometry (file u_err, unitless).';
comment on column codar_totals.gdop is 'Geometric dilution of precision (ONC flags > 1.25 as bad).';
comment on column codar_totals.flag is 'ONC quality flag: 1 good, 2 probably good, 3 bad but correctable, 4 bad.';
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--file", type=Path, default=NC_FILE, help="CODAR Totals NetCDF.")
    parser.add_argument("--inspect", action="store_true", help="Print the file's dims, variables and units, then stop.")
    parser.add_argument("--dry-run", action="store_true", help="Print the summary, write nothing.")
    args = parser.parse_args()
    if not args.file.exists():
        sys.exit(f"{args.file} not found.")

    ds = xr.open_dataset(args.file, engine="h5netcdf")
    if args.inspect:
        inspect(ds)
        return

    cells, totals = build(ds)
    describe(cells, totals)
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(cells, totals)


def inspect(ds: xr.Dataset) -> None:
    print(f"Dims: {dict(ds.sizes)}")
    for name, var in ds.variables.items():
        units = var.attrs.get("units", "")
        extra = ""
        if "flag_values" in var.attrs:
            extra = f" flag_values={list(np.asarray(var.attrs['flag_values']).astype(int))}"
        print(f"  {name:20} {str(var.dims):26} {str(var.dtype):10} units={units!r}{extra}  {var.attrs.get('long_name', '')}")
    for key in ("title", "site_code", "ssr_Stations", "time_coverage_start", "time_coverage_end", "time_coverage_resolution"):
        print(f"  @{key}: {ds.attrs.get(key)}")
    if "quality_flag" in ds:
        flags = ds["quality_flag"].to_numpy()
        values, counts = np.unique(flags[np.isfinite(flags)], return_counts=True)
        print(f"Quality flags (cells x hours): {dict(zip(values.astype(int).tolist(), counts.tolist(), strict=True))}")
        u = ds["u"].to_numpy()
        for f in values:
            print(f"  flag {int(f)}: u set {int(np.isfinite(u[flags == f]).sum())}")


# --- Read


def velocity_factor(ds: xr.Dataset, name: str) -> float:
    units = str(ds[name].attrs.get("units", "")).strip()
    if units not in TO_MS:
        sys.exit(f"{name}: unknown units {units!r}; add it to TO_MS after checking the file.")
    return TO_MS[units]


def lat_lon_grid(ds: xr.Dataset) -> tuple[np.ndarray, np.ndarray]:
    """Latitude and longitude per (y, x) cell, from 2-D or 1-D coordinates."""
    lat, lon = ds["lat"], ds["lon"]
    if lat.ndim == 2:
        return lat.transpose("y", "x").to_numpy(), lon.transpose("y", "x").to_numpy()
    lon2, lat2 = np.meshgrid(lon.to_numpy(), lat.to_numpy())
    return lat2, lon2


def km_axis(ds: xr.Dataset, name: str) -> tuple[np.ndarray, float]:
    """The x or y distances (km) and their (uniform) spacing."""
    units = ds[name].attrs.get("units", "km")
    if units != "km":
        sys.exit(f"{name}: expected km, got {units!r}.")
    km = ds[name].to_numpy().astype(float)
    steps = np.diff(km)
    if len(steps) == 0 or not np.allclose(steps, steps[0]):
        sys.exit(f"{name}: the grid spacing is not uniform.")
    return km, float(steps[0])


def build(ds: xr.Dataset) -> tuple[pd.DataFrame, pd.DataFrame]:
    factors = {name: velocity_factor(ds, name) for name in ("u", "v", "u_raw", "v_raw")}
    x_km, dx = km_axis(ds, "x")
    y_km, dy = km_axis(ds, "y")
    if not math.isclose(dx, dy):
        sys.exit(f"The grid is not square: dx {dx} km, dy {dy} km.")
    lat, lon = lat_lon_grid(ds)
    ny, nx = lat.shape

    iy, ix = np.meshgrid(np.arange(ny), np.arange(nx), indexing="ij")
    xx, yy = np.meshgrid(x_km, y_km)
    cells = pd.DataFrame(
        {
            "cell_id": (iy * nx + ix).ravel(),
            "ix": ix.ravel(),
            "iy": iy.ravel(),
            "x_km": xx.ravel(),
            "y_km": yy.ravel(),
            "lat": lat.ravel().round(6),
            "lon": lon.ravel().round(6),
        }
    )
    cells.attrs.update({"nx": nx, "ny": ny, "dx_km": dx})

    def grid(name: str) -> np.ndarray:
        return ds[name].transpose("time", "y", "x").to_numpy().astype(float)

    flag = grid("quality_flag")
    u_clean, v_clean = grid("u") * factors["u"], grid("v") * factors["v"]
    u_raw, v_raw = grid("u_raw") * factors["u_raw"], grid("v_raw") * factors["v_raw"]
    u = np.where(np.isfinite(u_clean), u_clean, u_raw)
    v = np.where(np.isfinite(v_clean), v_clean, v_raw)
    keep = np.isin(flag, STORED_FLAGS) & np.isfinite(u) & np.isfinite(v)
    t_idx, y_idx, x_idx = np.nonzero(keep)

    # Hourly times carry float jitter in the file (e.g. 00:59:59.999997): round to the second.
    times = pd.to_datetime(ds["time"].to_numpy()).round("s").tz_localize("UTC")
    totals = pd.DataFrame(
        {
            "ts": times[t_idx],
            "cell_id": y_idx * nx + x_idx,
            "u": u[keep].round(4),
            "v": v[keep].round(4),
            "u_err": grid("u_err")[keep].round(4),
            "v_err": grid("v_err")[keep].round(4),
            "gdop": grid("gdop")[keep].round(4),
            "n_radials": pd.array(grid("number_of_radials")[keep], dtype="Int64"),
            "flag": flag[keep].astype(int),
        }
    )
    totals.attrs["hours"] = times
    return cells, totals


# --- Summary


def describe(cells: pd.DataFrame, totals: pd.DataFrame) -> None:
    hours = totals.attrs["hours"]
    good = totals[totals["flag"].isin(GOOD_FLAGS)]
    print(f"Grid: {cells.attrs['nx']} x {cells.attrs['ny']} cells of {cells.attrs['dx_km']:g} km")
    print(f"Hours: {len(hours)} ({hours[0]:%Y-%m-%d %H:%MZ} to {hours[-1]:%Y-%m-%d %H:%MZ})")
    print(f"Rows: {len(totals)}; by flag {totals['flag'].value_counts().sort_index().to_dict()}")
    per_hour = good.groupby("ts").size().reindex(hours, fill_value=0)
    print(f"Good cells per hour: min {per_hour.min()}, median {per_hour.median():.0f}, max {per_hour.max()}; cells with good data at least once: {good['cell_id'].nunique()}")
    speed = np.hypot(good["u"], good["v"])
    p50, p95, top = np.percentile(speed, [50, 95, 100])
    print(f"Speed (good): p50 {p50:.2f} m/s ({p50 * MS_TO_KN:.1f} kn), p95 {p95:.2f} m/s ({p95 * MS_TO_KN:.1f} kn), max {top:.2f} m/s")
    route_coverage(cells, good, len(hours))


def route_coverage(cells: pd.DataFrame, good: pd.DataFrame, n_hours: int) -> None:
    """Share of the route (sampled every ROUTE_STEP_M) within COVER_KM of a well-covered cell."""
    route = json.loads(ROUTE_FILE.read_text())
    line = [tuple(p) for p in route["points"]]
    cumulative = cumulative_m(line)
    along = np.arange(0, cumulative[-1], ROUTE_STEP_M)
    pts = np.array([point_along(line, cumulative, a) for a in along])
    fraction = along / cumulative[-1]

    share = good.groupby("cell_id").size() / n_hours
    cell_ll = cells.set_index("cell_id").loc[:, ["lat", "lon"]]
    print(f"Route coverage (route every {ROUTE_STEP_M} m, a cell within {COVER_KM} km):")
    for label, min_share in ((f"good in >= {COVER_SHARE:.0%} of hours", COVER_SHARE), ("good in any hour", 1e-9)):
        ids = share.index[share >= min_share]
        ll = cell_ll.loc[ids].to_numpy()
        kx = np.cos(np.radians(pts[:, 0]))[:, None] * 111.32
        d = np.hypot((pts[:, 1][:, None] - ll[None, :, 1]) * kx, (pts[:, 0][:, None] - ll[None, :, 0]) * 110.574)
        covered = (d <= COVER_KM).any(axis=1) if len(ll) else np.zeros(len(pts), bool)
        zones = ", ".join(
            f"{z['id']} {covered[(fraction >= z['from']) & (fraction < z['to'])].mean():.0%}"
            for z in route["zones"]
            if ((fraction >= z["from"]) & (fraction < z["to"])).any()
        )
        print(f"  {label}: {covered.mean():.0%} of the route ({zones})")


# --- Output


def write(cells: pd.DataFrame, totals: pd.DataFrame) -> None:
    with get_engine().begin() as conn:
        conn.execute(text("drop table if exists codar_totals, codar_cells"))
        conn.execute(text(CELLS_DDL))
        conn.execute(text(TOTALS_DDL))
        cursor = conn.connection.driver_connection.cursor()
        copy_frame(cursor, "codar_cells", cells)
        copy_frame(cursor, "codar_totals", totals)
    print(f"Wrote codar_cells ({len(cells)} rows), codar_totals ({len(totals)})")


if __name__ == "__main__":
    main()
