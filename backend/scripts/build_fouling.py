"""The bridge's biofouling layer for one day: GeoJSON model points → frontend/public/data/{date}/fouling.json.

The SEAsk team's experimental ML model scores how likely marine life is to settle on a hull in each
1/24° cell (`experimental_bfi_proxy`, relative 0-100, higher = more fouling), with the spread
across its scenarios (`scenario_spread`). The cells outside the model's training extent are null;
cells the model treats as land have no point at all. Status: an unvalidated relative screening
proxy, so the bridge shows it as an advisory, never as a route.

Writes the bridge's compact grid style (cell = iy * nLon + ix, iy 0 = south, as `meteo_grid.Grid`):
    {dataset, mode, date, status, grid: {lat0, lon0, dLat, dLon, nLat, nLon},
     score: [cells], spread: [cells], cover: [cells: 0 no point (land), 1 outside extent, 2 scored], credit}

There is no API route: the bridge reads this file only (one model run, for the replay day).

Run from backend/:
    .venv/bin/python scripts/build_fouling.py --dry-run   # summary and the hotspots on the route only
    .venv/bin/python scripts/build_fouling.py             # writes the file
"""

import argparse
import itertools
import json
import math
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.frames import rnd, to_bytes

FRONTEND = BACKEND.parent / "frontend"
ROUTE_FILE = FRONTEND / "src/config/route.json"
OUT = FRONTEND / "public" / "data"
SOURCE = BACKEND / "data" / "seask_experimental_bfi_proxy_{date}.geojson"

STATUS = "UNVALIDATED_RELATIVE_ENVIRONMENTAL_SCREENING_PROXY"
CREDIT = "SEAsk team biofouling model (experimental, unvalidated)"
SNAP_DEG = 1e-4
# Same as FOULING in frontend/src/bridge/derive/fouling.ts (for the summary only).
ELEVATED = 65
MIN_NM = 0.5
BINS = 200
EARTH_RADIUS_M = 6371008.8
NM = 1852


def axis(values: list[float]) -> tuple[float, float, int]:
    """(first, step, count) of a regular axis through `values` (float32 noise allowed)."""
    xs = sorted({round(v, 5) for v in values})
    steps = [b - a for a, b in itertools.pairwise(xs)]
    step = min(steps)
    # The model grid sits on 1/48° (cell centres of a 1/24° grid); snap to it to drop the float32 noise.
    step = round(step * 24) / 24 or step
    first = round(xs[0] * 48) / 48
    n = round((xs[-1] - first) / step) + 1
    return first, step, n


def build(path: Path, date: str) -> dict:
    features = json.loads(path.read_text())["features"]
    lat0, d_lat, n_lat = axis([f["geometry"]["coordinates"][1] for f in features])
    lon0, d_lon, n_lon = axis([f["geometry"]["coordinates"][0] for f in features])
    n = n_lat * n_lon
    score: list[float | None] = [None] * n
    spread: list[float | None] = [None] * n
    cover = [0] * n
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        p = f["properties"]
        ix, iy = round((lon - lon0) / d_lon), round((lat - lat0) / d_lat)
        if abs(lon0 + ix * d_lon - lon) > SNAP_DEG or abs(lat0 + iy * d_lat - lat) > SNAP_DEG:
            raise SystemExit(f"Point {lat}, {lon} is off the grid")
        if p.get("status") != STATUS or p.get("date") != date:
            raise SystemExit(f"Point {lat}, {lon}: unexpected status or date {p.get('status')}, {p.get('date')}")
        s, sp, outside = p["experimental_bfi_proxy"], p["scenario_spread"], p["outside_training_extent"]
        if (s is None) != (sp is None) or (s is None) != outside:
            raise SystemExit(f"Point {lat}, {lon}: score, spread and outside_training_extent disagree")
        k = iy * n_lon + ix
        score[k], spread[k], cover[k] = rnd(s, 1), rnd(sp, 1), 1 if outside else 2
    return {
        "dataset": "fouling",
        "mode": "replay",
        "date": date,
        "status": STATUS,
        "grid": {
            "lat0": round(lat0, 6),
            "lon0": round(lon0, 6),
            "dLat": d_lat,
            "dLon": d_lon,
            "nLat": n_lat,
            "nLon": n_lon,
        },
        "score": score,
        "spread": spread,
        "cover": cover,
        "credit": CREDIT,
    }


def grid_value(payload: dict, cells: list, lat: float, lon: float) -> float | None:
    """Like `gridValue` in frontend/src/bridge/field.ts: bilinear, missing corners left out, None under 0.25 weight."""
    g = payload["grid"]
    fx, fy = (lon - g["lon0"]) / g["dLon"], (lat - g["lat0"]) / g["dLat"]
    if fx < -0.5 or fy < -0.5 or fx > g["nLon"] - 0.5 or fy > g["nLat"] - 0.5:
        return None
    x0, y0 = max(0, min(g["nLon"] - 1, math.floor(fx))), max(0, min(g["nLat"] - 1, math.floor(fy)))
    x1, y1 = min(g["nLon"] - 1, x0 + 1), min(g["nLat"] - 1, y0 + 1)
    kx, ky = max(0, min(1, fx - x0)), max(0, min(1, fy - y0))
    total = weight = 0.0
    for x, y, w in ((x0, y0, (1 - kx) * (1 - ky)), (x1, y0, kx * (1 - ky)), (x0, y1, (1 - kx) * ky), (x1, y1, kx * ky)):
        v = cells[y * g["nLon"] + x]
        if v is not None:
            total += v * w
            weight += w
    return total / weight if weight > 0.25 else None


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def summary(payload: dict) -> None:
    cover = payload["cover"]
    g = payload["grid"]
    scored = [s for s in payload["score"] if s is not None]
    spreads = [s for s in payload["spread"] if s is not None]
    print(f"grid {g['nLat']}×{g['nLon']} from {g['lat0']}, {g['lon0']} every {g['dLat']:.6f}°")
    print(
        f"cells: {cover.count(2)} scored, {cover.count(1)} outside the training extent, {cover.count(0)} without a point (land)"
    )
    print(
        f"score {min(scored)}-{max(scored)} (mean {sum(scored) / len(scored):.1f}); spread {min(spreads)}-{max(spreads)}"
    )

    route = json.loads(ROUTE_FILE.read_text())
    points = [tuple(p) for p in route["points"]]
    cumulative = [0.0]
    for a, b in itertools.pairwise(points):
        cumulative.append(cumulative[-1] + distance_m(a, b))
    length = cumulative[-1]

    def at(fraction: float) -> tuple[float, float]:
        along = fraction * length
        i = next((i for i, c in enumerate(cumulative[1:]) if c >= along), len(points) - 2)
        span = cumulative[i + 1] - cumulative[i]
        t = (along - cumulative[i]) / span if span else 0
        return points[i][0] + t * (points[i + 1][0] - points[i][0]), points[i][1] + t * (
            points[i + 1][1] - points[i][1]
        )

    bins = [((b + 0.5) / BINS, grid_value(payload, payload["score"], *at((b + 0.5) / BINS))) for b in range(BINS)]
    known = [v for _, v in bins if v is not None]
    print(f"route {length / NM:.1f} nm, scored on {len(known)}/{BINS} bins, {min(known):.1f}-{max(known):.1f}")
    runs: list[list[float]] = []
    for fraction, v in bins:
        if v is not None and v >= ELEVATED:
            if runs and abs(runs[-1][1] - (fraction - 1 / BINS)) < 1e-9:
                runs[-1][1], runs[-1][2] = fraction, max(runs[-1][2], v)
            else:
                runs.append([fraction, fraction, v])
    runs = [r for r in runs if (r[1] - r[0] + 1 / BINS) * length / NM >= MIN_NM]
    for n, (a, b, peak) in enumerate(runs, 1):
        zone = next(z["id"] for z in route["zones"] if z["from"] <= (a + b) / 2 <= z["to"])
        nm = (b - a + 1 / BINS) * length / NM
        print(f"  F{n} {zone}: fraction {a - 0.5 / BINS:.3f}-{b + 0.5 / BINS:.3f}, {nm:.1f} nm, peak {peak:.1f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--date", default="2026-08-17")
    parser.add_argument(
        "--source", type=Path, help="Model GeoJSON (default data/seask_experimental_bfi_proxy_{date}.geojson)."
    )
    parser.add_argument("--out", type=Path, default=OUT, help="Folder to write to (default frontend/public/data).")
    parser.add_argument("--dry-run", action="store_true", help="Print the summary only.")
    args = parser.parse_args()

    payload = build(args.source or Path(str(SOURCE).format(date=args.date)), args.date)
    summary(payload)
    if args.dry_run:
        return
    out = args.out / args.date / "fouling.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    body = to_bytes(payload)
    out.write_bytes(body)
    print(f"wrote {out} ({len(body) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
