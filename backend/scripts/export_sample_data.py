"""Make the frontend's sample ship feed and route line from the recorded day in Neon (2026-08-17).

Writes:
- frontend/src/mocks/common/ship-feed.json: one round trip, one row every 10 s, with the
  `/api/ship/latest` keys (speed in knots, `heading` in degrees true). The cycle starts 20 min
  before a departure and ends 20 min before the next departure from the same terminal, so it
  starts and ends docked at the same berth and loops without a jump.
- frontend/src/config/route.json: `points` from the 1 Hz track of a Swartz Bay -> Tsawwassen
  crossing (berth to berth), simplified with Douglas-Peucker. `activePassAt` and the zone and stop
  fractions are moved to the new line: the point at the old fraction on the old line is projected
  onto the new one. Every other field is kept.
- frontend/src/mocks/common/qc.json: for each reading the Lab table shows, the share of the day's
  samples that passed ONC's quality control. Sea sensors count only the seconds with seawater
  flowing to them (`readings_derived.is_sampling`; ONC flags the dry berth time bad), from the ONC
  flags of the TSG, OXYSENSOR and TURBCHLFL in `readings_derived`. Air sensors (sampled all day)
  come from `sensors.pct_good` (the hackathon's TWSB_2026-08-17_inventory.csv).

Neon is only read (a read-only transaction).

Run from backend/:  .venv/bin/python scripts/export_sample_data.py [--crossing N] [--dry-run] [--qc-only]
Needs NEON_URL in backend/.env.
"""

import argparse
import bisect
import itertools
import json
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import text

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import get_settings
from app.times import LOCAL_TZ, iso_local, iso_utc
from db import get_engine

FRONTEND = BACKEND.parent / "frontend"
FEED_FILE = FRONTEND / "src/mocks/common/ship-feed.json"
ROUTE_FILE = FRONTEND / "src/config/route.json"
QC_FILE = FRONTEND / "src/mocks/common/qc.json"

STEP_S = 10
DOCK_LEAD = timedelta(minutes=20)
# Avoid the TSG gap (no salinity or sea temperature between 17:00 and 19:00 local).
GAP_LOCAL = (17, 19)
MORNING_BEFORE_H = 12
MS_TO_KN = 1.943844
DOCKED_MAX_KN = 0.3
SIMPLIFY_M = 20.0
EARTH_RADIUS_M = 6371008.8  # same as frontend/src/ship/geo.ts

# Feed columns, in the order of the current file, with their decimals (0 = integer).
# `heading` sits where `/api/ship/latest` puts it.
FEED_COLUMNS = {
    "latitude": 6,
    "longitude": 6,
    "air_temperature": 2,
    "barometric_pressure": 2,
    "cdom_fluorescence": 3,
    "chlorophyll": 3,
    "conductivity": 4,
    "current": 2,
    "heading": 1,
    "oxygen_saturation": 1,
    "roll": 1,
    "salinity": 3,
    "ship_course": 1,
    "sound_speed": 2,
    "speed_over_ground": 2,
    "systemstatus": 0,
    "tank_level": 1,
    "tsg_temperature": 3,
    "turbidity": 3,
    "valve_position_status": 0,
}
# Never null in the feed (the frontend `ShipRow` types them as numbers): previous value instead.
REQUIRED = ("latitude", "longitude", "ship_course", "speed_over_ground", "heading")
READINGS_SQL = text(
    "select ts, latitude, longitude, air_temperature, barometric_pressure, cdom_fluorescence, "
    "chlorophyll, conductivity, current, heading, magnetic_heading, oxygen_saturation, roll, "
    "salinity, ship_course, sound_speed, speed_over_ground, systemstatus, tank_level, "
    "tsg_temperature, turbidity, valve_position_status from readings "
    "where ts >= :start and ts <= :end order by ts"
)

# Lab table reading -> its ONC device's QC flag column in readings_derived, or the sensors row
# (deviceCategoryCode, sensor) for the air sensors.
QC_FLAG = {
    "tsg_temperature": "tsg_flag",
    "salinity": "tsg_flag",
    "conductivity": "tsg_flag",
    "sound_speed": "tsg_flag",
    "oxygen_saturation": "oxygen_flag",
    "chlorophyll": "optics_flag",
    "turbidity": "optics_flag",
    "cdom_fluorescence": "optics_flag",
}
QC_SENSOR = {
    "air_temperature": ("TEMPHUMID", "air_temperature"),
    "barometric_pressure": ("BARPRESS", "barometric_pressure"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--crossing", type=int, help="First crossing id of the round trip.")
    parser.add_argument("--dry-run", action="store_true", help="Print the summaries, write nothing.")
    parser.add_argument("--qc-only", action="store_true", help="Write only qc.json.")
    args = parser.parse_args()
    declination = get_settings().magnetic_declination_deg

    with get_engine().connect() as conn:
        conn.execute(text("set transaction read only"))
        qc = build_qc(conn)
        print("QC % (" + ", ".join(f"{k} {v}" for k, v in qc["items"].items()) + ")")
        if args.qc_only:
            if not args.dry_run:
                write_qc(qc)
            return
        crossings = conn.execute(
            text("select id, direction, start_ts, end_ts from crossings order by id")
        ).fetchall()
        first = pick_round_trip(crossings, args.crossing)
        trip = crossings[first : first + 3]
        cycle_start = (trip[0].start_ts - DOCK_LEAD).replace(microsecond=0)
        cycle_end = trip[2].start_ts - DOCK_LEAD
        readings = conn.execute(
            READINGS_SQL,
            {"start": cycle_start - timedelta(seconds=2), "end": cycle_end + timedelta(seconds=2)},
        ).fetchall()

    east = next(c for c in trip if c.direction == "swb_to_tsa")
    feed = build_feed(readings, cycle_start, cycle_end, declination)
    route = build_route(readings, east)

    describe_trip(trip, cycle_start, cycle_end, feed)
    old_route = json.loads(ROUTE_FILE.read_text())
    new_route = remap_route(old_route, route)
    if args.dry_run:
        print("Dry run: nothing written.")
        return
    FEED_FILE.write_text(json.dumps(feed, separators=(",", ":"), allow_nan=False))
    ROUTE_FILE.write_text(format_route(new_route))
    write_qc(qc)
    print(f"Wrote {FEED_FILE.relative_to(BACKEND.parent)} ({FEED_FILE.stat().st_size / 1000:.0f} kB)")
    print(f"Wrote {ROUTE_FILE.relative_to(BACKEND.parent)}")


# --- Quality control


def build_qc(conn) -> dict:
    """QC pass rate (%) per Lab reading on the recorded day; see the module docstring."""
    flags = sorted(set(QC_FLAG.values()))
    sql = ", ".join(
        f"round(100.0 * count(*) filter (where {f} = 1) / nullif(count({f}), 0), 1) as {f}" for f in flags
    )
    sea = conn.execute(text(f"select {sql} from readings_derived where is_sampling")).mappings().one()
    air = {
        (r.deviceCategoryCode, r.sensor): float(r.pct_good)
        for r in conn.execute(text('select "deviceCategoryCode", sensor, pct_good from sensors'))
    }
    day = conn.execute(text("select min(ts) from readings")).scalar_one().astimezone(LOCAL_TZ).date()
    items = {key: float(sea[flag]) for key, flag in QC_FLAG.items()}
    items |= {key: air[row] for key, row in QC_SENSOR.items()}
    return {
        "date": day.isoformat(),
        "source": "Ocean Networks Canada QC flags, TWSB; sea sensors while seawater flows to them",
        "items": items,
    }


def write_qc(qc: dict) -> None:
    QC_FILE.write_text(json.dumps(qc, indent=2) + "\n")
    print(f"Wrote {QC_FILE.relative_to(BACKEND.parent)}")


# --- Round trip and feed


def pick_round_trip(crossings: list, wanted: int | None) -> int:
    """Index of crossing i such that i and i+1 go opposite ways, i+2 leaves from the same terminal
    as i, and the cycle is clear of the TSG gap. Default: the first one that starts in the morning."""
    for i in range(len(crossings) - 2):
        a, b, c = crossings[i : i + 3]
        if wanted is not None and a.id != wanted:
            continue
        if a.direction == b.direction or c.direction != a.direction:
            continue
        start = (a.start_ts - DOCK_LEAD).astimezone(LOCAL_TZ)
        end = (c.start_ts - DOCK_LEAD).astimezone(LOCAL_TZ)
        gap_start = start.replace(hour=GAP_LOCAL[0], minute=0, second=0, microsecond=0)
        gap_end = start.replace(hour=GAP_LOCAL[1], minute=0, second=0, microsecond=0)
        if start < gap_end and end > gap_start:
            continue
        if wanted is None and start.hour >= MORNING_BEFORE_H:
            continue
        return i
    sys.exit(f"No suitable round trip{f' starting with crossing {wanted}' if wanted else ''}.")


def build_feed(readings: list, start: datetime, end: datetime, declination: float) -> list[dict]:
    """One row every STEP_S from `start` (inclusive) to `end` (exclusive): the nearest reading."""
    times = [r.ts.timestamp() for r in readings]
    rows: list[dict] = []
    previous: dict[str, float] = {}
    steps = int((end - start).total_seconds() // STEP_S)
    for k in range(steps):
        tick = start + timedelta(seconds=k * STEP_S)
        r = nearest(readings, times, tick.timestamp())
        values = {name: number(getattr(r, name, None)) for name in FEED_COLUMNS if name != "heading"}
        if values["speed_over_ground"] is not None:
            values["speed_over_ground"] *= MS_TO_KN
        heading = number(r.heading)
        if heading is None and number(r.magnetic_heading) is not None:
            heading = (r.magnetic_heading + declination) % 360
        values["heading"] = heading

        row = {"time": iso_utc(tick, "milliseconds"), "time_local": iso_local(tick)}
        for name, digits in FEED_COLUMNS.items():
            value = values[name]
            if value is None and name in REQUIRED:
                value = previous.get(name)
            if value is not None:
                previous[name] = value
                value = round(value, digits) if digits else round(value)
            row[name] = value
        rows.append(row)

    # Leading rows before the first value of a required column take its first value.
    for name in REQUIRED:
        first = next((row[name] for row in rows if row[name] is not None), 0)
        for row in rows:
            if row[name] is not None:
                break
            row[name] = first
    return rows


def nearest(readings: list, times: list[float], t: float):
    i = bisect.bisect_left(times, t)
    candidates = [j for j in (i - 1, i) if 0 <= j < len(readings)]
    return readings[min(candidates, key=lambda j: abs(times[j] - t))]


def number(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    try:
        value = float(value)  # Decimal
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def local(dt: datetime) -> str:
    return dt.astimezone(LOCAL_TZ).strftime("%H:%M:%S")


def describe_trip(trip: list, start: datetime, end: datetime, feed: list[dict]) -> None:
    print("Sample feed round trip (local time, 2026-08-17):")
    for c in trip[:2]:
        print(f"  crossing {c.id} {c.direction}: {local(c.start_ts)} -> {local(c.end_ts)}")
    print(f"  next departure (crossing {trip[2].id}): {local(trip[2].start_ts)}")
    length = (end - start).total_seconds()
    print(
        f"  cycle {local(start)} -> {local(end)} = {length:.0f} s ({length / 3600:.2f} h), "
        f"{len(feed)} rows every {STEP_S} s"
    )
    a, b = feed[0], feed[-1]
    gap = distance_m((a["latitude"], a["longitude"]), (b["latitude"], b["longitude"]))
    print(f"  loop seam: {gap:.1f} m, heading {b['heading']} -> {a['heading']}")


# --- Route


def build_route(readings: list, east) -> list[tuple[float, float]]:
    """Berth-to-berth track of the eastbound crossing, simplified."""
    before = [r for r in readings if r.ts < east.start_ts and has_position(r)]
    after = [r for r in readings if r.ts > east.end_ts and has_position(r)]
    swb_berth = berth(before[-600:])
    tsa_berth = berth(after[:1800])
    # Leaving the berth: the last docked reading before departure; arriving: the first docked one after.
    leave = next(r.ts for r in reversed(before) if knots(r) < DOCKED_MAX_KN)
    arrive = next(r.ts for r in after if knots(r) < DOCKED_MAX_KN)
    track = [(r.latitude, r.longitude) for r in readings if leave <= r.ts <= arrive and has_position(r)]
    return simplify([swb_berth, *track, tsa_berth], SIMPLIFY_M)


def has_position(r) -> bool:
    return number(r.latitude) is not None and number(r.longitude) is not None


def knots(r) -> float:
    return (number(r.speed_over_ground) or 0) * MS_TO_KN


def berth(rows: list) -> tuple[float, float]:
    """Median position while docked."""
    docked = [r for r in rows if knots(r) < DOCKED_MAX_KN] or rows
    lats = sorted(r.latitude for r in docked)
    lons = sorted(r.longitude for r in docked)
    return lats[len(lats) // 2], lons[len(lons) // 2]


def simplify(points: list[tuple[float, float]], tolerance_m: float) -> list[tuple[float, float]]:
    """Douglas-Peucker in metres (local equirectangular projection)."""
    lat0 = math.radians(sum(p[0] for p in points) / len(points))
    xy = [
        (math.radians(lon) * EARTH_RADIUS_M * math.cos(lat0), math.radians(lat) * EARTH_RADIUS_M)
        for lat, lon in points
    ]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = xy[i], xy[j]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        worst, worst_d = -1, tolerance_m
        for k in range(i + 1, j):
            px, py = xy[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / length if length else math.hypot(px - ax, py - ay)
            if d > worst_d:
                worst, worst_d = k, d
        if worst >= 0:
            keep[worst] = True
            stack += [(i, worst), (worst, j)]
    return [p for p, k in zip(points, keep, strict=True) if k]


def remap_route(old: dict, points: list[tuple[float, float]]) -> dict:
    """`old` with the new points and every fraction moved onto them. 0 and 1 stay 0 and 1."""
    old_points = [tuple(p) for p in old["points"]]
    old_cum, new_cum = cumulative_m(old_points), cumulative_m(points)

    def move(fraction: float) -> float:
        if fraction in (0, 1):
            return fraction
        p = point_along(old_points, old_cum, fraction * old_cum[-1])
        along, off = project(p, points, new_cum)
        new = round(along / new_cum[-1], 3)
        print(f"  {fraction:<6} -> {new:<6} (old point {p[0]:.4f},{p[1]:.4f}, {off:.0f} m off the new line)")
        return new

    print(
        f"Route: {len(old_points)} -> {len(points)} points, "
        f"{old_cum[-1] / 1000:.2f} -> {new_cum[-1] / 1000:.2f} km"
    )
    out = {**old, "points": [[round(lat, 5), round(lon, 5)] for lat, lon in points]}
    print(" activePassAt:")
    out["activePassAt"] = move(old["activePassAt"])
    out["zones"] = []
    for zone in old["zones"]:
        print(f" zone {zone['id']}:")
        out["zones"].append({**zone, "from": move(zone["from"]), "to": move(zone["to"])})
    out["stops"] = []
    for stop in old["stops"]:
        print(f" stop {stop.get('label', '(unnamed)')}:")
        out["stops"].append({**stop, "at": move(stop["at"])})
    return out


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance, like `distanceM` in frontend/src/ship/geo.ts."""
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    cos_lats = math.cos(math.radians(a[0])) * math.cos(math.radians(b[0]))
    h = math.sin(dlat / 2) ** 2 + cos_lats * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def cumulative_m(points: list[tuple[float, float]]) -> list[float]:
    out = [0.0]
    for a, b in itertools.pairwise(points):
        out.append(out[-1] + distance_m(a, b))
    return out


def point_along(points: list, cumulative: list[float], along: float) -> tuple[float, float]:
    """Like `pointAlong` in geo.ts."""
    nxt = next((i for i, c in enumerate(cumulative) if c > along), -1)
    i = len(points) - 2 if nxt == -1 else max(0, nxt - 1)
    span = cumulative[i + 1] - cumulative[i]
    t = min(1, max(0, (along - cumulative[i]) / span)) if span else 0
    (a0, a1), (b0, b1) = points[i], points[i + 1]
    return a0 + t * (b0 - a0), a1 + t * (b1 - a1)


def project(p: tuple[float, float], points: list, cumulative: list[float]) -> tuple[float, float]:
    """Like `projectOnLine` in geo.ts: (distance along the line, distance from it), in metres."""
    kx, ky = math.cos(math.radians(p[0])) * 111320, 110574
    best = (0.0, math.inf)
    px, py = p[1] * kx, p[0] * ky
    for i in range(len(points) - 1):
        ax, ay = points[i][1] * kx, points[i][0] * ky
        bx, by = points[i + 1][1] * kx, points[i + 1][0] * ky
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        t = min(1, max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) if len2 else 0
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
        if d2 < best[1]:
            best = (cumulative[i] + t * (cumulative[i + 1] - cumulative[i]), d2)
    return best[0], math.sqrt(best[1])


def format_route(route: dict) -> str:
    """2-space JSON like the hand-written file: 4 points per line, one zone or stop per line."""
    lines = ["{"]
    items = list(route.items())
    for n, (key, value) in enumerate(items):
        comma = "," if n < len(items) - 1 else ""
        if key == "points":
            pairs = [f"[{lat:.5f}, {lon:.5f}]" for lat, lon in value]
            rows = [", ".join(pairs[i : i + 4]) for i in range(0, len(pairs), 4)]
            lines.append('  "points": [')
            lines += [f"    {row}{',' if i < len(rows) - 1 else ''}" for i, row in enumerate(rows)]
            lines.append(f"  ]{comma}")
        elif isinstance(value, list) and all(isinstance(v, dict) for v in value):
            lines.append(f"  {json.dumps(key)}: [")
            for i, obj in enumerate(value):
                body = ", ".join(f"{json.dumps(k)}: {scalar(v)}" for k, v in obj.items())
                lines.append(f"    {{ {body} }}{',' if i < len(value) - 1 else ''}")
            lines.append(f"  ]{comma}")
        else:
            lines.append(f"  {json.dumps(key)}: {scalar(value)}{comma}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def scalar(value) -> str:
    """JSON for a value; whole floats as integers (0, not 0.0)."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return json.dumps(value, ensure_ascii=False)


if __name__ == "__main__":
    main()
