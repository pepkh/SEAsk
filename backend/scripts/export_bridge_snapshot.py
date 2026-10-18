"""Offline copy of a bridge day for the kiosk: frontend/public/data/{date}/{dataset}.json.

The bridge screen loads each dataset from the API first and falls back to these files, so a demo
works with the backend (or the network) down. The files are the exact API responses, fetched
in-process with FastAPI's TestClient (no server needed). This also fills the API's `bridge_cache`.

Run from backend/:
    .venv/bin/python scripts/export_bridge_snapshot.py --date 2026-08-17
    .venv/bin/python scripts/export_bridge_snapshot.py --out /tmp/snapshot   # elsewhere (size check)

The model currents (`ocean`) are exported with `?stride=5` (--ocean-stride): the SalishSeaCast grids
keep every 5th row and column (~3.3 km and ~22 km cells instead of 0.65 and 4.4 km), 0.25 MB instead
of 4.3 MB (stride 4: 0.35 MB, 3: 0.55 MB), to keep the whole export under ~4.5 MB.
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

OUT = BACKEND.parent / "frontend" / "public" / "data"

# (file name, API path). Coarser ship and traffic steps and ocean grids keep the files small; the API
# serves finer.
DATASETS = (
    ("ship", "/bridge/{date}/ship?step={ship_step}"),
    ("tides", "/bridge/{date}/tides"),
    ("weather", "/bridge/{date}/weather"),
    ("windobs", "/bridge/{date}/windobs"),
    ("stations", "/bridge/{date}/stations"),
    ("currents", "/bridge/{date}/currents"),
    ("ocean", "/bridge/{date}/ocean?stride={ocean_stride}"),
    ("profiles", "/bridge/{date}/profiles"),
    ("traffic", "/bridge/{date}/traffic?step={traffic_step}"),
    ("sources", "/bridge/{date}/sources"),
    ("trips-stats", "/trips/stats"),
    ("route-profile", "/route/profile"),
    ("climatology", "/route/climatology?window=aug"),
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", default="2026-08-17")
    parser.add_argument("--ship-step", type=int, default=20, help="Seconds per ship row (API default 10).")
    parser.add_argument("--traffic-step", type=int, default=180, help="Seconds per AIS fix (multiple of 60, up to 600).")
    parser.add_argument(
        "--ocean-stride", type=int, default=5, help="Keep every Nth row and column of the ocean model grids (1-8)."
    )
    parser.add_argument("--budget-mb", type=float, default=4.5, help="Warn above this total size.")
    parser.add_argument("--out", type=Path, default=OUT, help="Folder to write to (default frontend/public/data).")
    args = parser.parse_args()

    out = args.out.resolve()
    folder = out / args.date
    folder.mkdir(parents=True, exist_ok=True)
    total = 0
    missing = []
    steps = {"ship_step": args.ship_step, "traffic_step": args.traffic_step, "ocean_stride": args.ocean_stride}
    with TestClient(app) as client:
        for name, path in DATASETS:
            url = path.format(date=args.date, **steps)
            r = client.get(url)
            if r.status_code != 200:
                missing.append(f"{name} ({r.status_code} {r.text[:80]})")
                continue
            body = json.dumps(r.json(), separators=(",", ":"), ensure_ascii=False).encode()
            (folder / f"{name}.json").write_bytes(body)
            total += len(body)
            print(f"  {name:14} {len(body) / 1024:8.1f} kB  {url}")
        days = client.get("/bridge/days")
        if days.status_code == 200:
            (out / "index.json").write_text(json.dumps(days.json(), separators=(",", ":")))

    print(f"Wrote {total / 1e6:.2f} MB to {folder}")
    if missing:
        print("Not exported: " + "; ".join(missing))
    if total > args.budget_mb * 1e6:
        print(f"WARNING: over the {args.budget_mb} MB budget; raise --ship-step, --traffic-step or --ocean-stride")


if __name__ == "__main__":
    main()
