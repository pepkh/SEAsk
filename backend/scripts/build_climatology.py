"""Build the multi-year "usual for August" water values along the route (Neon `route_climatology`).

Pulls the ferry's ONC sensors for the same August days of several years with the `onc` package
(`scalardata/location`, one-minute averages, `qualityControl=clean`): TWSB TSG (temperature,
salinity), OXYSENSOR (oxygen saturation), TURBCHLFL (chlorophyll, turbidity) and the TWSB.N1 NAV
position and speed. Keeps the underway minutes (speed over ground > 2 m/s) that lie on the route
line (frontend/src/config/route.json, at most OFF_ROUTE_MAX_M off it), snaps them to the same BINS
equal parts of the line as `route_profile` (`project_many` from build_derived.py) and writes, per
bin and variable, the mean, 10th and 90th percentiles, the number of minutes and the years present.
Instrument-days that pass the ONC QC but are not seawater values (fresh-water flushes, an
uncalibrated fluorometer) are dropped first: see DAY_GATES. Bins without data get no row.

Replaces only the rows of its window ('aug') in `route_climatology`, in one transaction. Each
year's pull is cached under backend/data/climatology/ (one gzipped CSV per year and sensor), so a
second run reads the cache and an interrupted run resumes where it stopped.

The ferry's position (TWSB.N1 NAV) exists from August 2017, with no deployment in 2019, so the
default years are 2017-2025: 2017 (from Aug 15), 2018 and 2020-2025 have data. The older TSG years
(2001-2016) have no position to place them on the route. `--inspect-years` prints what each year
and sensor has. A request outside a deployment (ONC 400) counts as no data.

Run from backend/:  .venv/bin/python scripts/build_climatology.py [--years 2020-2025] [--dry-run]
                    .venv/bin/python scripts/build_climatology.py --inspect-years
Needs NEON_URL and ONC_TOKEN in backend/.env.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from onc import ONC
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_derived import BINS, QC_DROP, UNDERWAY_MIN_MS, copy_frame, project_many
from export_sample_data import BACKEND, ROUTE_FILE, cumulative_m

from app.config import get_settings
from db import get_engine

CACHE_DIR = BACKEND / "data/climatology"
WINDOW = "aug"
MONTH = 8
FIRST_DAY, LAST_DAY = 3, 31  # inclusive, UTC days of August
DEFAULT_YEARS = "2017-2025"
RESAMPLE_S = 60
OFF_ROUTE_MAX_M = 2000.0
CHUNK_DAYS = 10  # one request per CHUNK_DAYS days (allPages follows the pages)

# ONC device category -> (location setting or code, {ONC propertyCode: column}).
CATEGORIES = {
    "NAV": ("nav", {"latitude": "lat", "longitude": "lon", "speedoverground": "sog"}),
    "TSG": ("ship", {"seawatertemperature": "sst", "salinity": "sal"}),
    "OXYSENSOR": ("ship", {"gassaturation": "o2Sat"}),
    "TURBCHLFL": ("ship", {"chlorophyll": "chl", "turbidityntu": "turb"}),
}
# The variables of the table (same keys as the API payload), with their plausible range: values
# outside are dropped as sensor faults that the ONC QC let through.
VARS = {"sst": (0.0, 30.0), "sal": (5.0, 35.0), "o2Sat": (0.0, 250.0), "chl": (0.0, 100.0), "turb": (0.0, 100.0)}
# Whole instrument-days that the ONC QC lets through but are not seawater values: category ->
# (variable, lowest plausible daily median, columns dropped for that UTC day). Salinity under 10
# is a fresh-water flush (2022-08-16), oxygen saturation under 50 % a sensor fault (2024-08-12),
# and chlorophyll under 0.2 ug/l an uncalibrated fluorometer: for weeks in 2021, 2022 and 2024 it
# reads 0.02-0.04 (August surface values on the route are 1-5, as on 2026-08-17); its turbidity
# goes with it (same instrument).
DAY_GATES = {
    "TSG": ("sal", 10.0, ("sst", "sal")),
    "OXYSENSOR": ("o2Sat", 50.0, ("o2Sat",)),
    "TURBCHLFL": ("chl", 0.2, ("chl", "turb")),
}
SANITY_BINS = (10, 100, 190)

DDL = """
create table if not exists route_climatology (
  "window" text not null,
  bin smallint not null,
  var text not null,
  mean real,
  p10 real,
  p90 real,
  n integer not null,
  years smallint[] not null,
  primary key ("window", bin, var)
);
comment on table route_climatology is 'Multi-year water values per route bin (same 200 bins as route_profile) for a window of the year, e.g. aug = Aug 3-31 of 2017-2025, from ONC TWSB one-minute averages. Built by backend/scripts/build_climatology.py.';
comment on column route_climatology."window" is 'Window of the year (quoted: a reserved word), e.g. aug.';
comment on column route_climatology.var is 'sst (degC), sal (psu), o2Sat (%), chl (ug/l) or turb (NTU).';
comment on column route_climatology.n is 'Underway minutes with a value in the bin, all years together.';
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--years", default=DEFAULT_YEARS, help="Years, e.g. 2020-2025 or 2021,2023.")
    parser.add_argument("--first-day", type=int, default=FIRST_DAY, help="First day of August (UTC).")
    parser.add_argument("--last-day", type=int, default=LAST_DAY, help="Last day of August, inclusive.")
    parser.add_argument("--inspect-years", action="store_true", help="Print which years have TSG and NAV data in the window, then exit.")
    parser.add_argument("--dry-run", action="store_true", help="Pull and print the summary, write nothing to Neon.")
    args = parser.parse_args()
    started = time.monotonic()

    settings = get_settings()
    if not settings.onc_token:
        sys.exit("ONC_TOKEN is not set in backend/.env.")
    onc = ONC(settings.onc_token, showInfo=False, showWarning=False, timeout=600)
    locations = {"ship": settings.onc_location_code, "nav": settings.onc_nav_location_code}

    if args.inspect_years:
        inspect_years(onc, locations, args.first_day, args.last_day)
        return

    years = parse_years(args.years)
    route = json.loads(ROUTE_FILE.read_text())
    line = [tuple(p) for p in route["points"]]
    cumulative = cumulative_m(line)

    frames = []
    for year in years:
        raw = {cat: pull(onc, locations, year, cat, args.first_day, args.last_day) for cat in CATEGORIES}
        frames.append(join_year(year, raw, line, cumulative))
    minutes = pd.concat(frames, ignore_index=True)
    table = climatology(minutes)

    describe(minutes, table, years, args.first_day, args.last_day)
    print(f"Runtime {time.monotonic() - started:.0f} s")
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(table)


def parse_years(spec: str) -> list[int]:
    out: set[int] = set()
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out.update(range(int(a), int(b) + 1))
        elif part.strip():
            out.add(int(part))
    return sorted(out)


# --- ONC pulls


def window_dates(year: int, first_day: int, last_day: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    start = pd.Timestamp(year=year, month=MONTH, day=first_day, tz="UTC")
    end = pd.Timestamp(year=year, month=MONTH, day=last_day, tz="UTC") + pd.Timedelta(days=1)
    return start, end


def scalar_frame(onc: ONC, location: str, category: str, props: dict[str, str], start, end, period: int) -> pd.DataFrame:
    """One-`period` averages of `props` (QC-clean) as columns, indexed by the start of each period."""
    response = onc.getScalardataByLocation(
        {
            "locationCode": location,
            "deviceCategoryCode": category,
            "propertyCode": ",".join(props),
            "dateFrom": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "dateTo": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "resampleType": "avg",
            "resamplePeriod": period,
            "qualityControl": "clean",
            "rowLimit": 100000,
        },
        allPages=True,
    )
    columns = {}
    for sensor in response.get("sensorData") or []:
        name = props.get(sensor["propertyCode"])
        if name is None or name in columns:
            continue
        data = sensor["data"]
        values = pd.to_numeric(pd.Series(data["values"], dtype="object"), errors="coerce").astype(float)
        flags = pd.Series(data.get("qaqcFlags") or [None] * len(values))
        values[flags.isin(QC_DROP).to_numpy()] = np.nan
        # Resampled sample times are the middle of the period: floor to its start.
        index = pd.to_datetime(data["sampleTimes"], utc=True).floor(f"{period}s")
        columns[name] = pd.Series(values.to_numpy(), index=index).groupby(level=0).mean()
    if not columns:
        return empty_frame(props)
    out = pd.DataFrame(columns)
    out.index.name = "ts"
    return out


def empty_frame(props: dict[str, str]) -> pd.DataFrame:
    return pd.DataFrame(columns=list(props.values()), index=pd.DatetimeIndex([], tz="UTC", name="ts"), dtype=float)


def not_deployed(exc: Exception) -> bool:
    """The onc package raises HTTPError('Status 400 - ...') for a time range outside every
    deployment of the category at the location. (Never print the message: it holds the token.)"""
    return "Status 400" in str(exc)[:40]


def pull(onc: ONC, locations: dict, year: int, category: str, first_day: int, last_day: int) -> pd.DataFrame:
    """The year's one-minute values of a category, from the cache when it is there."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{year}-{category}-aug{first_day:02d}-{last_day:02d}.csv.gz"
    if path.exists():
        frame = pd.read_csv(path, index_col="ts").astype(float)
        frame.index = pd.DatetimeIndex(pd.to_datetime(frame.index, utc=True), name="ts")  # also when empty
        return frame
    where, props = CATEGORIES[category]
    location = locations[where]
    start, end = window_dates(year, first_day, last_day)
    t = time.monotonic()
    parts = []
    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + pd.Timedelta(days=CHUNK_DAYS), end)
        for attempt in range(3):
            try:
                parts.append(scalar_frame(onc, location, category, props, chunk_start, chunk_end, RESAMPLE_S))
                break
            except Exception as exc:  # noqa: BLE001 - network errors of the onc package vary
                if not_deployed(exc):
                    print(f"  {year} {category} {chunk_start:%m-%d}: no device deployed", flush=True)
                    break
                if attempt == 2:
                    raise
                print(f"  {year} {category} {chunk_start:%m-%d}: {type(exc).__name__}, retrying", flush=True)
                time.sleep(10 * (attempt + 1))
        chunk_start = chunk_end
    frame = pd.concat(parts).sort_index() if parts else empty_frame(props)
    frame = frame[~frame.index.duplicated(keep="last")]
    frame.to_csv(path)
    valid = int(frame.notna().any(axis=1).sum())
    print(f"  pulled {year} {location} {category}: {len(frame)} minutes, {valid} with data, {time.monotonic() - t:.0f} s", flush=True)
    return frame


def inspect_years(onc: ONC, locations: dict, first_day: int, last_day: int) -> None:
    """Days with data in the window, per year and sensor (n/a = no deployment in the window)."""
    print(f"Days with data, Aug {first_day}-{last_day} (hourly averages, QC clean; n/a = not deployed):")
    print("year " + " ".join(f"{c:>9}" for c in CATEGORIES))
    for year in range(2001, pd.Timestamp.now(tz="UTC").year + 1):
        start, end = window_dates(year, first_day, last_day)
        cells = []
        for category, (where, props) in CATEGORIES.items():
            try:
                hourly = scalar_frame(onc, locations[where], category, props, start, end, 3600)
                cells.append(str(hourly[hourly.notna().any(axis=1)].index.floor("1D").nunique()))
            except Exception as exc:  # noqa: BLE001
                cells.append("n/a" if not_deployed(exc) else type(exc).__name__)
        print(f"{year} " + " ".join(f"{c:>9}" for c in cells), flush=True)
    print("Only years with NAV can be placed on the route.")


# --- Climatology

# Row counts per year, for the summary.
YEAR_STATS: list[dict] = []


def join_year(year: int, raw: dict[str, pd.DataFrame], line: list, cumulative: list) -> pd.DataFrame:
    """Underway, on-route minutes of a year with their bin and water values."""
    nav = raw["NAV"]
    stats = {"year": year, "nav": int(nav[["lat", "lon"]].notna().all(axis=1).sum())}
    parts = []
    for category, (var, lowest, columns) in DAY_GATES.items():
        frame = raw[category].copy()
        median = frame[var].groupby(frame.index.floor("1D")).transform("median")
        bad = (median < lowest).to_numpy()
        stats[f"bad_days_{category.lower()[:4]}"] = int(frame.index[bad].floor("1D").nunique())
        frame.loc[bad, list(columns)] = np.nan
        parts.append(frame)
    water = pd.concat(parts, axis=1, sort=True)
    stats["water"] = int(water[["sst", "sal"]].notna().any(axis=1).sum())
    df = nav.join(water, how="inner")
    df = df[(df["sog"] > UNDERWAY_MIN_MS) & df["lat"].notna() & df["lon"].notna()]
    stats["underway"] = len(df)
    if df.empty:
        YEAR_STATS.append(stats)
        return pd.DataFrame(columns=["ts", "year", "bin", *VARS])
    along, off = project_many(df["lat"].to_numpy(), df["lon"].to_numpy(), line, cumulative)
    keep = off <= OFF_ROUTE_MAX_M
    df = df[keep].copy()
    df["bin"] = np.minimum((along[keep] / cumulative[-1] * BINS).astype(int), BINS - 1)
    df["year"] = year
    for var, (lo, hi) in VARS.items():
        df.loc[~df[var].between(lo, hi), var] = np.nan
    stats["on_route"] = len(df)
    stats.update({var: int(df[var].notna().sum()) for var in VARS})
    YEAR_STATS.append(stats)
    return df.reset_index()[["ts", "year", "bin", *VARS]]


def climatology(minutes: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for var in VARS:
        values = minutes[["bin", "year", var]].dropna()
        grouped = values.groupby("bin")
        for b in sorted(grouped.groups):  # bins without data get no row
            g = grouped.get_group(b)
            v = g[var].to_numpy()
            years = sorted(int(y) for y in g["year"].unique())
            rows.append(
                {
                    "window": WINDOW,
                    "bin": b,
                    "var": var,
                    "mean": float(v.mean()),
                    "p10": float(np.percentile(v, 10)),
                    "p90": float(np.percentile(v, 90)),
                    "n": len(v),
                    "years": "{" + ",".join(str(y) for y in years) + "}",
                }
            )
    return pd.DataFrame(rows)


# --- Output


def write(table: pd.DataFrame) -> None:
    with get_engine().begin() as conn:
        conn.execute(text(DDL))
        deleted = conn.execute(text('delete from route_climatology where "window" = :w'), {"w": WINDOW}).rowcount
        cursor = conn.connection.driver_connection.cursor()
        copy_frame(cursor, "route_climatology", table.rename(columns={"window": '"window"'}))
    print(f"Wrote route_climatology window '{WINDOW}': {len(table)} rows (replaced {deleted})")


def describe(minutes: pd.DataFrame, table: pd.DataFrame, years: list[int], first_day: int, last_day: int) -> None:
    print(f"Window '{WINDOW}': Aug {first_day}-{last_day}, years {years[0]}-{years[-1]}")
    print("Per year: NAV minutes, instrument-days dropped by DAY_GATES, water minutes, underway joined, on route, then values per variable:")
    print(pd.DataFrame(YEAR_STATS).fillna(0).astype(int).to_string(index=False))
    print("Per-year means on the route (all bins):")
    print(minutes.groupby("year")[list(VARS)].mean().round(3).to_string())
    print(f"Coverage per variable (bins with data of {BINS}; minutes per bin min / median; bins by number of years):")
    for var in VARS:
        has = table[table["var"] == var]
        n_years = has["years"].str.count(",") + 1
        print(
            f"  {var:5s}: {len(has):3d} bins, n min {has['n'].min() if len(has) else 0} / median {int(has['n'].median()) if len(has) else 0}, "
            f"years per bin {n_years.value_counts().sort_index().to_dict()}"
        )
    print("Coverage per bin (sst minutes and years, every 10th bin):")
    sst = table[table["var"] == "sst"].set_index("bin")
    print("  " + " ".join(f"{b}:{sst['n'].get(b, 0)}/{sst['years'].get(b, '{}').count(',') + 1 if b in sst.index else 0}y" for b in range(0, BINS, 10)))
    print(f"Sanity (mean, p10-p90): bin 0 is Swartz Bay, bin {BINS - 1} Tsawwassen")
    indexed = table.set_index(["var", "bin"])
    for b in SANITY_BINS:
        parts = []
        for var in VARS:
            if (var, b) not in indexed.index:
                parts.append(f"{var} -")
                continue
            r = indexed.loc[(var, b)]
            parts.append(f"{var} {fmt(r['mean'])} ({fmt(r['p10'])}-{fmt(r['p90'])})")
        years = indexed.loc[("sst", b), "years"] if ("sst", b) in indexed.index else "{}"
        print(f"  bin {b:3d}: " + ", ".join(parts) + f", years {years}")


def fmt(v) -> str:
    return "-" if v is None or pd.isna(v) else f"{v:.2f}"


if __name__ == "__main__":
    main()
