"""Inventory of what ONC has around the route on one local day, into Neon `onc_inventory`.

Sweeps every ONC location with data in the local day (`locations?dateFrom&dateTo`) inside the
bridge bbox (48.55-49.35 N, 123.75-122.85 W). For each device category deployed there that day
(`deviceCategories` joined with `deployments`, plus `devices` for the device name), it probes:

- scalar: `scalardata/location`, rowLimit=1, one hour at local 00, 06, 12 and 18 h (then the whole
  day if all four are empty). `sensors` = the sensor category codes that returned values.
- archive: `archivefile/location` for the day. `sensors` = "extension:count" per file type.
- product: `dataProducts?locationCode&deviceCategoryCode`. `sensors` = the product codes; the
  status follows the scalar and archive probes (a product needs data underneath).

IOS drifters (`*.DR<n>`) get only a light probe and are left out unless they return data.
`used_by` names the bridge dataset that reads that location, category and kind (USED_BY).

Probes are cached in backend/data/onc_inventory/<date>.json (--refresh probes again). At most
PARALLEL requests run at once and 429/5xx responses are retried with backoff. Deletes the day's
rows, then inserts.

Run from backend/:  .venv/bin/python scripts/onc_inventory.py --date 2026-08-17 [--dry-run] [--refresh]
Needs ONC_TOKEN and NEON_URL in backend/.env.
"""

import argparse
import json
import re
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
from psycopg2.extras import execute_values
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_sample_data import BACKEND

from app.config import get_settings
from app.frames import day_bounds
from app.times import iso_utc
from db import get_engine

CACHE_DIR = BACKEND / "data/onc_inventory"
BBOX = (48.55, 49.35, -123.75, -122.85)  # south, north, west, east
PARALLEL = 5
TIMEOUT_S = 90
RETRIES = 5
PROBE_LOCAL_HOURS = (0, 6, 12, 18)
DRIFTER = re.compile(r"\.DR\d+$")

# (location pattern, device category or None for all, kinds, bridge dataset). First match wins.
# `stations` follows app/sources/onc_stations.json (no SEVIP current meter, no TWDP TEMPSENSOR).
USED_BY = (
    (r"^TWSB(\.N1)?$", None, ("scalar",), "ship"),
    (r"^(SCVIP|SEVIP)$", "ADCP150KHZ", ("product",), "profiles"),
    (r"^SCVIP$", "CTD|OXYSENSOR|FLNTU|CURRENTMETER", ("scalar",), "stations"),
    (r"^SEVIP$", "CTD|OXYSENSOR|TURBIDITYMETER", ("scalar",), "stations"),
    (r"^IONA$", "WINDMONITOR|BARPRESS", ("scalar",), "stations"),
    (r"^TWDP(\.N1)?$", "NAV|TSG|OXYSENSOR|TURBCHLFL", ("scalar",), "stations"),
    (r"^SOGCS$", "OCEANOGRAPHICRADAR", ("archive", "product"), "currents"),  # live .tuv, replay .nc
    (r"^IONA$", "AISRECEIVER", ("archive",), "traffic"),
)

DDL = """
create table if not exists onc_inventory (
  day date not null,
  location text not null,
  location_name text,
  lat double precision,
  lon double precision,
  depth_m real,
  category text not null,
  kind text not null check (kind in ('scalar', 'archive', 'product')),
  sensors text[] not null default '{}',
  status text not null check (status in ('ok', 'no_data')),
  device_code text,
  device_name text,
  deployed_from timestamptz,
  used_by text,
  primary key (day, location, category, kind)
);
comment on table onc_inventory is 'ONC locations and device categories in the bridge bbox with their data that local day. Built by backend/scripts/onc_inventory.py.';
comment on column onc_inventory.sensors is 'scalar: sensor category codes with values; archive: "extension:count" per file type; product: data product codes.';
comment on column onc_inventory.used_by is 'Bridge dataset reading this location, category and kind (ship, stations, currents, traffic, profiles), else null.';
"""

COLUMNS = (
    "day", "location", "location_name", "lat", "lon", "depth_m", "category", "kind", "sensors", "status",
    "device_code", "device_name", "deployed_from", "used_by",
)  # fmt: skip


class Onc:
    """GET on the Oceans 3.0 API: at most PARALLEL at once, 429 and 5xx retried, token never shown."""

    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.gate = threading.Semaphore(PARALLEL)
        self.local = threading.local()
        self.calls = Counter()

    def get(self, service: str, **params) -> tuple[int, object]:
        session = getattr(self.local, "session", None) or requests.Session()
        self.local.session = session
        delay = 2.0
        for attempt in range(RETRIES + 1):
            try:
                with self.gate:
                    self.calls[service] += 1
                    r = session.get(f"{self.base_url}/{service}", params={**params, "token": self.token}, timeout=TIMEOUT_S)
            except requests.RequestException as exc:
                if attempt == RETRIES:
                    return 0, {"error": str(exc).replace(self.token, "***")}
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code == 429 or r.status_code >= 500:
                if attempt == RETRIES:
                    return r.status_code, {"error": r.text[:200].replace(self.token, "***")}
                wait = float(r.headers.get("Retry-After") or delay)
                self.calls["retry"] += 1
                time.sleep(wait)
                delay *= 2
                continue
            try:
                return r.status_code, r.json()
            except ValueError:
                return r.status_code, {"error": r.text[:200].replace(self.token, "***")}
        return 0, {"error": "unreachable"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--date", type=date.fromisoformat, default=date(2026, 8, 17), help="Local day (America/Vancouver).")
    parser.add_argument("--dry-run", action="store_true", help="Probe and print, write nothing to Neon.")
    parser.add_argument("--refresh", action="store_true", help="Probe again even if cached.")
    args = parser.parse_args()

    cache = CACHE_DIR / f"{args.date.isoformat()}.json"
    if cache.exists() and not args.refresh:
        print(f"Using cached probes {cache.relative_to(BACKEND)} (--refresh to probe again)")
        probed = json.loads(cache.read_text())
    else:
        probed = sweep(args.date)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(probed, indent=1))

    rows = [{**r, "used_by": used_by(r["location"], r["category"], r["kind"])} for r in probed["rows"]]
    describe(rows, probed["stats"])
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    write(args.date, rows)


# --- Probing


def sweep(day: date) -> dict:
    settings = get_settings()
    if not settings.onc_token:
        sys.exit("ONC_TOKEN is not set in backend/.env.")
    onc = Onc(settings.onc_base_url, settings.onc_token)
    start, end = day_bounds(day)
    window = {"dateFrom": api_time(start), "dateTo": api_time(end)}

    status, locations = onc.get("locations", **window)
    if status != 200 or not isinstance(locations, list):
        sys.exit(f"locations: HTTP {status} {locations}")
    south, north, west, east = BBOX
    inside = [
        loc for loc in locations
        if loc.get("lat") is not None and loc.get("lon") is not None
        and south <= loc["lat"] <= north and west <= loc["lon"] <= east
    ]  # fmt: skip
    print(f"{len(inside)} of {len(locations)} ONC locations with data that day are in the bbox; probing ({PARALLEL} at a time)...")

    devices: dict[str, str | None] = {}
    devices_lock = threading.Lock()
    started = time.monotonic()
    with ThreadPoolExecutor(PARALLEL) as pool:
        results = list(pool.map(lambda loc: probe_location(onc, loc, day, window, devices, devices_lock), inside))

    rows = [row for loc_rows, _ in results for row in loc_rows]
    stats = Counter()
    for _, s in results:
        stats.update(s)
    stats.update({f"calls_{k}": v for k, v in onc.calls.items()})
    stats["locations"] = len(inside)
    stats["seconds"] = round(time.monotonic() - started)
    return {"date": day.isoformat(), "rows": rows, "stats": dict(stats)}


def probe_location(onc: Onc, loc: dict, day: date, window: dict, devices: dict, lock: threading.Lock) -> tuple[list, Counter]:
    code = loc["locationCode"]
    stats = Counter()
    drifter = bool(DRIFTER.search(code))
    status, deployments = onc.get("deployments", locationCode=code, **window)
    deployments = deployments if status == 200 and isinstance(deployments, list) else []
    latest: dict[str, dict] = {}
    for d in sorted(deployments, key=lambda d: d.get("begin") or ""):
        latest[d["deviceCategoryCode"]] = d
    if drifter:
        categories = sorted(latest)
    else:
        status, cats = onc.get("deviceCategories", locationCode=code)
        known = {c["deviceCategoryCode"] for c in cats} if status == 200 and isinstance(cats, list) else set()
        stats["categories_not_deployed"] += len(known - set(latest))
        categories = sorted(latest)

    rows = []
    for category in categories:
        dep = latest[category]
        base = {
            "day": day.isoformat(),
            "location": code,
            "location_name": loc.get("locationName"),
            "lat": dep.get("lat") if dep.get("lat") is not None else loc.get("lat"),
            "lon": dep.get("lon") if dep.get("lon") is not None else loc.get("lon"),
            "depth_m": dep.get("depth") if dep.get("depth") is not None else loc.get("depth"),
            "category": category,
            "device_code": dep.get("deviceCode"),
            "deployed_from": dep.get("begin"),
        }
        scalar_sensors, hit = probe_scalar(onc, code, category, day, window, light=drifter)
        files = probe_archive(onc, code, category, window)
        if drifter and not scalar_sensors and not files:
            continue
        products = [] if drifter else probe_products(onc, code, category)
        has_data = bool(scalar_sensors or files)
        base["device_name"] = device_name(onc, dep.get("deviceCode"), devices, lock)
        rows.append({**base, "kind": "scalar", "sensors": scalar_sensors, "status": ok(scalar_sensors), "probe": hit})
        rows.append({**base, "kind": "archive", "sensors": [f"{ext}:{n}" for ext, n in sorted(files.items())], "status": ok(files), "probe": None})
        if products:
            rows.append({**base, "kind": "product", "sensors": products, "status": ok(has_data), "probe": None})
    if drifter:
        stats["drifters_with_data" if rows else "drifters_skipped"] += 1
    return rows, stats


def probe_scalar(onc: Onc, code: str, category: str, day: date, window: dict, light: bool) -> tuple[list[str], str | None]:
    """Sensor category codes with values, and which probe found them ("00h".."18h", "day")."""
    start, _ = day_bounds(day)
    probes = [] if light else [(f"{h:02d}h", start + timedelta(hours=h), start + timedelta(hours=h + 1)) for h in PROBE_LOCAL_HOURS]
    probes.append(("day", None, None))
    for label, t0, t1 in probes:
        span = window if t0 is None else {"dateFrom": api_time(t0), "dateTo": api_time(t1)}
        status, body = onc.get("scalardata/location", locationCode=code, deviceCategoryCode=category, rowLimit=1, **span)
        if status != 200 or not isinstance(body, dict):
            continue
        sensors = sorted({s["sensorCategoryCode"] for s in body.get("sensorData") or [] if (s.get("data") or {}).get("values")})
        if sensors:
            return sensors, label
    return [], None


def probe_archive(onc: Onc, code: str, category: str, window: dict) -> Counter:
    status, body = onc.get("archivefile/location", locationCode=code, deviceCategoryCode=category, **window)
    if status != 200 or not isinstance(body, dict):
        return Counter()
    return Counter(f.rsplit(".", 1)[-1].lower() if "." in f else "?" for f in body.get("files") or [])


def probe_products(onc: Onc, code: str, category: str) -> list[str]:
    status, body = onc.get("dataProducts", locationCode=code, deviceCategoryCode=category)
    if status != 200 or not isinstance(body, list):
        return []
    return sorted({p["dataProductCode"] for p in body})


def device_name(onc: Onc, device_code: str | None, cache: dict, lock: threading.Lock) -> str | None:
    if not device_code:
        return None
    with lock:
        if device_code in cache:
            return cache[device_code]
    status, body = onc.get("devices", deviceCode=device_code)
    name = body[0].get("deviceName") if status == 200 and isinstance(body, list) and body else None
    with lock:
        cache[device_code] = name
    return name


def api_time(dt: datetime) -> str:
    return iso_utc(dt, "milliseconds")


def ok(value) -> str:
    return "ok" if value else "no_data"


def used_by(location: str, category: str, kind: str) -> str | None:
    for loc_pattern, cat_pattern, kinds, dataset in USED_BY:
        if re.match(loc_pattern, location) and (cat_pattern is None or re.fullmatch(cat_pattern, category)):
            return dataset if kind in kinds else None
    return None


# --- Summary and output


def describe(rows: list[dict], stats: dict) -> None:
    print(f"{'location':12} {'category':20} {'kind':8} {'status':8} {'used by':9} {'device':34} sensors")
    for r in sorted(rows, key=lambda r: (r["location"], r["category"], r["kind"])):
        sensors = ", ".join(r["sensors"])
        probe = f" [{r['probe']}]" if r.get("probe") and r["probe"] != "00h" else ""
        print(
            f"{r['location']:12} {r['category']:20} {r['kind']:8} {r['status']:8} {r['used_by'] or '-':9} "
            f"{(r['device_code'] or '-')[:34]:34} {sensors[:90]}{'...' if len(sensors) > 90 else ''}{probe}"
        )
    print()
    by_kind = Counter((r["kind"], r["status"]) for r in rows)
    print("Rows by kind: " + ", ".join(f"{k} {by_kind[(k, 'ok')]} ok / {by_kind[(k, 'no_data')]} no_data" for k in ("scalar", "archive", "product")))
    pairs = {(r["location"], r["category"]) for r in rows}
    with_data = {(r["location"], r["category"]) for r in rows if r["status"] == "ok" and r["kind"] != "product"}
    used = {(r["location"], r["category"]) for r in rows if r["used_by"]}
    print(
        f"Locations probed {stats.get('locations')}, drifters skipped (no data) {stats.get('drifters_skipped', 0)}, "
        f"drifters with data {stats.get('drifters_with_data', 0)}; location/category pairs {len(pairs)}: "
        f"{len(with_data)} with data, {len(pairs - with_data)} without; categories listed but not deployed that day "
        f"{stats.get('categories_not_deployed', 0)}"
    )
    calls = {k[6:]: v for k, v in stats.items() if k.startswith("calls_")}
    if calls:
        print(f"API calls: {sum(v for k, v in calls.items() if k != 'retry')} ({calls.get('retry', 0)} retries) in {stats.get('seconds')} s")
    unused = sorted(with_data - used)
    print(f"With data that day but not used by the bridge ({len(unused)}):")
    for loc, cat in unused:
        sensors = sorted({s for r in rows if (r["location"], r["category"]) == (loc, cat) and r["kind"] == "scalar" for s in r["sensors"]})
        files = sorted({s for r in rows if (r["location"], r["category"]) == (loc, cat) and r["kind"] == "archive" for s in r["sensors"]})
        print(f"  {loc:12} {cat:20} scalar: {', '.join(sensors)[:80] or '-'}; files: {', '.join(files) or '-'}")
    missing = sorted(used - with_data)
    if missing:
        print(f"Used by the bridge but without data that day: {missing}")


def write(day: date, rows: list[dict]) -> None:
    values = [tuple(r[c] for c in COLUMNS) for r in rows]
    with get_engine().begin() as conn:
        conn.execute(text(DDL))
        deleted = conn.execute(text("delete from onc_inventory where day = :d"), {"d": day}).rowcount
        cursor = conn.connection.driver_connection.cursor()
        execute_values(cursor, f"insert into onc_inventory ({', '.join(COLUMNS)}) values %s", values)
    print(f"Wrote onc_inventory: deleted {deleted} rows of {day}, inserted {len(values)}")


if __name__ == "__main__":
    main()
