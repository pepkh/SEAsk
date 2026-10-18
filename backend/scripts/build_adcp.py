"""Build the ADCP current-profile table in Neon for one local day (default 2026-08-17).

Orders the ONC data product RADCPTS (RDI ADCP Time Series, NetCDF) for the upward-looking 150 kHz
ADCPs on the Strait of Georgia VENUS nodes, SCVIP (Central, ~294 m) and SEVIP (East, ~165 m), with
600 s ensembles (`dpo_ensemblePeriod`), 3-beam solutions, nearest-bin mapping and ONC's
correlation (64 counts) and error-velocity (2 m/s) screens. ONC rotates the beam velocities to
true east/north with the deployment heading. Files are kept in backend/data/adcp/<node>/ and
reused on the next run (--refresh orders again).

Cleaning:
- Bins in the side-lobe zone near the surface are dropped: shallower than SIDELOBE_SHARE of the
  transducer depth (from its pressure sensor). Theory gives 1 - cos(20 deg) = 6% for a 20 deg
  beam; 10% leaves room for the tide and the surface echo.
- Samples with a beam-mean correlation below CORR_MIN counts or a beam-mean percent good below
  PG_MIN are dropped, then spikes: samples whose vector differs by more than SPIKE_MS from the
  median of their 8 neighbours (adjacent bins and windows). Bins with good data in less than
  BIN_MIN_SHARE of the day are dropped whole.
- Values are averaged to 600 s windows; `ts` is the start of the window.

Deletes the day's rows of the ordered nodes from adcp_profiles, then inserts (other days stay).

Run from backend/:  .venv/bin/python scripts/build_adcp.py [--date 2026-08-17] [--inspect] [--dry-run] [--refresh]
Needs ONC_TOKEN and NEON_URL in backend/.env.
"""

import argparse
import sys
import warnings
from datetime import date
from pathlib import Path

import gsw
import numpy as np
import pandas as pd
import xarray as xr
from onc import ONC
from scipy.ndimage import generic_filter
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_derived import copy_frame
from export_sample_data import BACKEND, MS_TO_KN

from app.config import get_settings
from app.frames import day_bounds
from db import get_engine

DATA_DIR = BACKEND / "data/adcp"
NODES = ("SCVIP", "SEVIP")
DEVICE_CATEGORY = "ADCP150KHZ"
ENSEMBLE_S = 600
PRODUCT_OPTIONS = {
    "dataProductCode": "RADCPTS",
    "extension": "nc",
    "dpo_ensemblePeriod": str(ENSEMBLE_S),
    "dpo_3beam": "On",
    "dpo_corScreen": "64",
    "dpo_errVelScreen": "2",
    "dpo_falseTarScreen": "255",
    "dpo_velocityBinmapping": "1",  # nearest vertical bin (tilt correction)
}
SIDELOBE_SHARE = 0.10
# Mean correlation of the four beams after the 600 s average (ONC already drops pings below 64).
# Below ~85 m (SCVIP) / ~55 m (SEVIP) the echo is at the noise floor (~40 counts) and the
# correlation falls to 45-60; 45 drops the noise-floor samples and keeps whole profiles up to the
# side-lobe limit (64 would cut SCVIP off at 60 m).
CORR_MIN = 45
# Mean percent good of the four beams. 100 throughout on 2026-08-17 (the ADCP's own screens are
# off: WC, WE, WG = 0), so the correlation does the work; kept for other days.
PG_MIN = 25
# On 2026-08-17 this drops 0.7% (SCVIP) and 3.6% (SEVIP) of the samples, all above 90 m, and the
# maximum speed falls from ~4.5 to ~1.4 m/s.
SPIKE_MS = 0.5
BIN_MIN_SHARE = 0.5

DDL = """
create table if not exists adcp_profiles (
  node text not null,
  ts timestamptz not null,
  bin_depth_m real not null,
  u real,
  v real,
  pg real,
  primary key (node, ts, bin_depth_m)
);
comment on table adcp_profiles is 'ONC 150 kHz ADCP current profiles at SCVIP and SEVIP, 600 s ensembles (RADCPTS). Built by backend/scripts/build_adcp.py.';
comment on column adcp_profiles.ts is 'Start of the 600 s ensemble window, UTC.';
comment on column adcp_profiles.bin_depth_m is 'Bin depth below the surface, m (ONC bin-mapped depth).';
comment on column adcp_profiles.u is 'Eastward current, m/s (true).';
comment on column adcp_profiles.v is 'Northward current, m/s (true).';
comment on column adcp_profiles.pg is 'Mean percent good of the four beams.';
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--date", type=date.fromisoformat, default=date(2026, 8, 17), help="Local day (America/Vancouver).")
    parser.add_argument("--node", choices=NODES, action="append", help="Only this node (repeatable).")
    parser.add_argument("--inspect", action="store_true", help="Print the NetCDF variables, then stop.")
    parser.add_argument("--dry-run", action="store_true", help="Print the summary, write nothing.")
    parser.add_argument("--refresh", action="store_true", help="Order the files again even if downloaded.")
    args = parser.parse_args()
    nodes = args.node or list(NODES)
    start, end = day_bounds(args.date)

    files = {node: product_file(node, start, end, args.refresh) for node in nodes}
    if args.inspect:
        for node, path in files.items():
            inspect(node, path)
        return

    frames = [clean(node, xr.open_dataset(path, engine="h5netcdf"), start, end) for node, path in files.items()]
    profiles = pd.concat(frames, ignore_index=True)
    describe(profiles)
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(profiles, nodes, start, end)


# --- Download


def product_file(node: str, start: pd.Timestamp, end: pd.Timestamp, refresh: bool) -> Path:
    """The RADCPTS NetCDF of `node` for [start, end), ordered from ONC when not downloaded yet."""
    out = DATA_DIR / node
    pattern = f"*_{start:%Y%m%dT%H%M%S}Z_{end:%Y%m%dT%H%M%S}Z-Ensemble{ENSEMBLE_S}s*.nc"
    found = sorted(out.glob(pattern))
    if found and not refresh:
        print(f"{node}: using {found[-1].relative_to(BACKEND)}")
        return found[-1]

    token = get_settings().onc_token
    if not token:
        sys.exit("ONC_TOKEN is not set in backend/.env.")
    out.mkdir(parents=True, exist_ok=True)
    onc = ONC(token, showInfo=False, outPath=str(out), timeout=600)
    print(f"{node}: ordering RADCPTS for {start:%Y-%m-%dT%H:%MZ} to {end:%Y-%m-%dT%H:%MZ}")
    try:
        result = onc.orderDataProduct(
            {
                "locationCode": node,
                "deviceCategoryCode": DEVICE_CATEGORY,
                "dateFrom": f"{start:%Y-%m-%dT%H:%M:%S}.000Z",
                "dateTo": f"{end:%Y-%m-%dT%H:%M:%S}.000Z",
                **PRODUCT_OPTIONS,
            },
            maxRetries=0,
            includeMetadataFile=False,
            overwrite=True,
        )
    except Exception as exc:  # the onc package puts the token in its error URLs
        sys.exit(
            f"{node}: ordering RADCPTS failed: {str(exc).replace(token, '***')}\n"
            "Fallback: the daily raw RDI archive file (archivefile/location, e.g. "
            "RDIADCP150WH17457_20260817T000000.000Z.txt), which this script does not parse yet."
        )
    names = [r["file"] for r in result["downloadResults"] if r.get("downloaded") and str(r["file"]).endswith(".nc")]
    if not names:
        sys.exit(f"{node}: the order returned no NetCDF file: {result['downloadResults']}")
    return out / names[0]


def inspect(node: str, path: Path) -> None:
    ds = xr.open_dataset(path, engine="h5netcdf")
    print(f"{node}: {path.name}")
    print(f"  dims {dict(ds.sizes)}; time {ds['time'].values[0]} .. {ds['time'].values[-1]}")
    for name, var in ds.variables.items():
        print(f"  {name:20} {str(var.dims):18} units={var.attrs.get('units', '')!r:12} {var.attrs.get('long_name', '')}")
    for key in ("device_name", "location_name", "platform_depth", "device_heading", "orientation", "beam_angle",
                "adcp_setup_WS_cell_size_meters", "adcp_setup_WN_number_bins", "adcp_setup_TE_ensemble_interval_sec"):  # fmt: skip
        print(f"  @{key}: {ds.attrs.get(key)}")


# --- Cleaning


def clean(node: str, ds: xr.Dataset, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    for name in ("u", "v"):
        if ds[name].attrs.get("units") not in ("m s-1", "m/s"):
            sys.exit(f"{node}: {name} units {ds[name].attrs.get('units')!r}, expected m s-1.")
    if str(ds.attrs.get("orientation", "Up")).lower() != "up":
        sys.exit(f"{node}: the ADCP is not upward-looking ({ds.attrs.get('orientation')}).")

    depth = ds["binmap_depth"].to_numpy()  # positive down, one per bin
    lat = float(np.asarray(ds["latitude"]).ravel()[0])
    transducer_m = float(np.nanmedian(-gsw.z_from_p(ds["pressure"].to_numpy(), lat)))
    sidelobe_m = SIDELOBE_SHARE * transducer_m

    def grid(name: str) -> np.ndarray:  # (time, bin)
        return ds[name].transpose("time", "depth").to_numpy().astype(float)

    u, v = grid("u"), grid("v")
    corr = np.nanmean(np.stack([grid(f"corr_beam{b}") for b in range(1, 5)]), axis=0)
    pg = np.nanmean(np.stack([grid(f"percentGood_beam{b}") for b in range(1, 5)]), axis=0)
    in_water = depth >= sidelobe_m
    screened = np.isfinite(u) & np.isfinite(v) & (corr >= CORR_MIN) & (pg >= PG_MIN) & in_water[None, :]
    spikes = spiky(np.where(screened, u, np.nan), np.where(screened, v, np.nan))
    good = screened & ~spikes
    bin_share = good.mean(axis=0)
    keep_bins = in_water & (bin_share >= BIN_MIN_SHARE)
    good &= keep_bins[None, :]

    times = pd.to_datetime(ds["time"].to_numpy()).tz_localize("UTC")
    t_idx, b_idx = np.nonzero(good)
    raw = pd.DataFrame(
        {
            # Ensemble times are window centres (07:05, 07:15, ...): the floor is the window start.
            "ts": times[t_idx].floor(f"{ENSEMBLE_S}s"),
            "bin_depth_m": depth[b_idx].round(2),
            "u": u[good],
            "v": v[good],
            "pg": pg[good],
        }
    )
    out = raw.groupby(["ts", "bin_depth_m"], as_index=False).mean()
    out = out[(out["ts"] >= start) & (out["ts"] < end)]
    out.insert(0, "node", node)
    out[["u", "v"]] = out[["u", "v"]].round(4)
    out["pg"] = out["pg"].round(1)
    print(
        f"{node}: transducer {transducer_m:.1f} m; {len(depth)} bins of "
        f"{ds.attrs.get('adcp_setup_WS_cell_size_meters', '?')} m; dropped {int((~in_water).sum())} side-lobe bins "
        f"(< {sidelobe_m:.1f} m) and {int((in_water & ~keep_bins).sum())} sparse bins; "
        f"{int((np.isfinite(u)[:, in_water]).sum() - (screened | spikes)[:, in_water].sum())} samples below corr {CORR_MIN} / pg {PG_MIN}; "
        f"{int(spikes.sum())} spikes"
    )
    return out.reset_index(drop=True)


def spiky(u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """(time, bin) samples more than SPIKE_MS from the median of their 8 neighbours."""
    footprint = np.ones((3, 3), dtype=bool)
    footprint[1, 1] = False

    def neighbours(a: np.ndarray) -> np.ndarray:
        with np.errstate(all="ignore"), warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN neighbourhoods
            return generic_filter(a, np.nanmedian, footprint=footprint, mode="constant", cval=np.nan)

    deviation = np.hypot(u - neighbours(u), v - neighbours(v))
    return np.nan_to_num(deviation, nan=0.0) > SPIKE_MS


# --- Summary and output


def describe(profiles: pd.DataFrame) -> None:
    for node, g in profiles.groupby("node", sort=False):
        bins = np.sort(g["bin_depth_m"].unique())
        speed = np.hypot(g["u"], g["v"])
        p50, p95, top = np.percentile(speed, [50, 95, 100])
        by_bin = g.assign(speed=speed).groupby("bin_depth_m")["speed"].median()
        print(
            f"{node}: {len(bins)} bins, {bins[0]:.1f} to {bins[-1]:.1f} m; {g['ts'].nunique()} windows "
            f"({g['ts'].min():%H:%MZ} to {g['ts'].max():%H:%MZ}); rows {len(g)}"
        )
        print(f"  speed p50 {p50:.2f} m/s ({p50 * MS_TO_KN:.1f} kn), p95 {p95:.2f} m/s ({p95 * MS_TO_KN:.1f} kn), max {top:.2f} m/s")
        print(f"  median speed: shallowest bin {by_bin.iloc[0]:.2f} m/s, mid {by_bin.iloc[len(by_bin) // 2]:.2f}, deepest {by_bin.iloc[-1]:.2f}")


def write(profiles: pd.DataFrame, nodes: list[str], start: pd.Timestamp, end: pd.Timestamp) -> None:
    with get_engine().begin() as conn:
        conn.execute(text(DDL))
        deleted = conn.execute(
            text("delete from adcp_profiles where node = any(:nodes) and ts >= :start and ts < :end"),
            {"nodes": nodes, "start": start, "end": end},
        ).rowcount
        copy_frame(conn.connection.driver_connection.cursor(), "adcp_profiles", profiles)
    print(f"Wrote adcp_profiles: deleted {deleted} rows of the day, inserted {len(profiles)}")


if __name__ == "__main__":
    main()
