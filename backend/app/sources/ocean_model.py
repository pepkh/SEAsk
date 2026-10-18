"""Model surface currents for the bridge map: the bridge `ocean` dataset.

The CODAR radar (`currents`) sees only the open Strait of Georgia: the Gulf Islands hide Swartz Bay,
the channels, Haro Strait and everything west. This dataset fills the rest with two models on
regular lat/lon grids (`layers`, finest first); the kiosk blends per place: CODAR first, then the
first layer with a value there.

- `ssc-fine` (BRIDGE_BBOX, 0.006° x 0.009°) and `ssc-wide` (47-51 N, 126.5-122 W, 0.04° x 0.06°):
  SalishSeaCast, UBC EOAS's NEMO model of the Salish Sea (~500 m), from UBC's ERDDAP, top model
  level (0.5 m, the top 1 m of water, like the radar):
  - replay: the hindcast `ubcSSg3DuGridFields1hV21-11` / `ubcSSg3DvGridFields1hV21-11` (2007 to
    about two days ago). A day the hindcast does not cover yet comes from the forecast below and is
    not stored as final, so it is rebuilt from the hindcast later;
  - live: the rolling forecast `ubcSSf3DuGridFields1h` / `ubcSSf3DvGridFields1h` (the last ~6 days
    and ~1.5 days ahead), cached per hour. (`ubcSSfDepthAvgdCurrents1h` VelEast5/VelNorth5 is the
    same model already rotated, but averaged over the top 5 m: about half the surface speed in the
    Fraser plume. The surface level matches the radar and the replay.)
  The model values are hourly means stamped at :30; a frame at :00 is the mean of the two around it.
  `uVelocity` / `vVelocity` follow the model grid (x about 29° left of east) and sit on the cell
  faces (u on the east face, v on the north face). For `ssc-fine` the velocity at a T point is the
  mean of its two faces (a land face counts as 0, a wall), rotated to east/north with the local grid
  angle: east = u cos(a) - v sin(a), north = u sin(a) + v cos(a). `ssc-wide` reads every 4th row and
  column and uses the faces as they are (half a model cell is nothing at 4 km).
  The geometry (the model point of each grid cell, its grid angle, the index boxes to download) is
  computed offline by scripts/build_ssc_map.py into `ssc_map.json`. Here only those boxes are
  downloaded, as `.dods` (binary float32, gzipped), at most ERDDAP_PARALLEL requests at a time.
- `global`: Open-Meteo Marine `ocean_current_velocity` / `ocean_current_direction` (Mercator global
  1/12°, about 8 km, surface; direction = where the current flows TOWARD, 0 = north) on a 0.25° x
  0.35° grid over OCEAN_AREA, asked only at the cells where it has water (listed in ssc_map.json),
  with `cell_selection=sea`. Replay days are cached for good; live is fetched once per 3 h.

u, v: int cm/s, east and north; null for land, outside the model or no data.
"""

import array
import asyncio
import json
import logging
import math
import struct
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.frames import Axis, day_axis
from app.http import UpstreamError, get_bytes, get_json
from app.sources import meteo_grid
from app.times import LOCAL_TZ, iso_utc

log = logging.getLogger(__name__)

ERDDAP = "https://salishsea.eos.ubc.ca/erddap"
HINDCAST = ("ubcSSg3DuGridFields1hV21-11", "ubcSSg3DvGridFields1hV21-11")
FORECAST = ("ubcSSf3DuGridFields1h", "ubcSSf3DvGridFields1h")
VARIABLES = ("uVelocity", "vVelocity")
ERDDAP_TIMEOUT_S = 120  # a replay day of the fine box: 4.3 MB (2.3 MB gzipped), ~8-10 s
ERDDAP_PARALLEL = 2
RANGE_TTL_S = 900  # the datasets' time ranges
SSC_LIVE_TTL_S = 3600
SSC_RETRY_S = 300  # after a failed live read, wait this long before asking UBC again
GLOBAL_LIVE_BLOCK_H = 3
GLOBAL_LIVE_PHASE_H = 2  # blocks at 2, 5, 8 ... UTC: the weather's atmosphere and wide read at 0 and 1
HALF_HOUR_S = 1800  # the model's hourly means are stamped at :30
FILL_ABOVE = 1e10  # ERDDAP's _FillValue is 1e20

MAP_PATH = Path(__file__).with_name("ssc_map.json")
CREDIT = "SalishSeaCast (UBC EOAS); global currents: Open-Meteo Marine (CC BY 4.0)"
SSC_LABEL = "SalishSeaCast"
SSC_DEPTH = "surface 0.5 m"
GLOBAL_LABEL = "Mercator global (Open-Meteo)"
GLOBAL_DEPTH = "surface"
RESOLUTION_KM = {"ssc-fine": 0.65, "ssc-wide": 4.4, "global": 8}
# Open-Meteo Marine: speed in km/h, sent here as cm/s; direction the current flows toward.
GLOBAL_VARS: tuple[meteo_grid.Var, ...] = (
    ("speed", "ocean_current_velocity", "km/h", 2, lambda kmh: kmh / 0.036),
    ("toward", "ocean_current_direction", None, 0, None),
)

_ranges = TTLCache(max_entries=8)
_ssc_live = TTLCache(max_entries=4)
_global_blocks = TTLCache(max_entries=4)
_slots: dict[int, asyncio.Semaphore] = {}


# --- The offline geometry (scripts/build_ssc_map.py)


@dataclass(frozen=True)
class Box:
    """Model index box [j0..j1] x [i0..i1] (inclusive), every `stride`-th row and column."""

    j0: int
    j1: int
    i0: int
    i1: int
    stride: int

    @property
    def nj(self) -> int:
        return (self.j1 - self.j0) // self.stride + 1

    @property
    def ni(self) -> int:
        return (self.i1 - self.i0) // self.stride + 1

    @property
    def size(self) -> int:
        return self.nj * self.ni

    def offset(self, j: int, i: int) -> int | None:
        s = self.stride
        if not (self.j0 <= j <= self.j1 and self.i0 <= i <= self.i1):
            return None
        if (j - self.j0) % s or (i - self.i0) % s:
            return None
        return (j - self.j0) // s * self.ni + (i - self.i0) // s

    def query(self) -> str:
        s = self.stride
        return f"[{self.j0}:{s}:{self.j1}][{self.i0}:{s}:{self.i1}]"


Face = tuple[int, int]  # (box, offset in the box)


@dataclass(frozen=True)
class MapLayer:
    id: str
    grid: dict[str, Any]
    boxes: tuple[Box, ...]
    cells: tuple[int, ...]  # grid cell of each mapped model point
    u_faces: tuple[tuple[Face, ...], ...]  # per point: u at (j, i) [and (j, i-1)]
    v_faces: tuple[tuple[Face, ...], ...]  # per point: v at (j, i) [and (j-1, i)]
    cos: tuple[float, ...]
    sin: tuple[float, ...]

    @property
    def n_cells(self) -> int:
        return self.grid["nLat"] * self.grid["nLon"]


@dataclass(frozen=True)
class OceanMap:
    layers: tuple[MapLayer, ...]
    global_grid: dict[str, Any]
    global_cells: tuple[int, ...]  # cells to ask Open-Meteo for (where it has water)


@lru_cache
def ocean_map() -> OceanMap:
    raw = json.loads(MAP_PATH.read_text())
    layers = tuple(_map_layer(layer) for layer in raw["layers"])
    grid = raw["global"]["grid"]
    cells = raw["global"]["cells"]
    if cells is None:
        cells = list(range(grid["nLat"] * grid["nLon"]))
    return OceanMap(layers, grid, tuple(cells))


def _map_layer(raw: dict[str, Any]) -> MapLayer:
    stride = raw["stride"]
    boxes = tuple(Box(j0, j1, i0, i1, stride) for j0, j1, i0, i1 in raw["boxes"])

    def locate(j: int, i: int) -> Face:
        for b, box in enumerate(boxes):
            off = box.offset(j, i)
            if off is not None:
                return b, off
        raise RuntimeError(f"ssc_map.json: {raw['id']} point ({j}, {i}) is in no box; rebuild the map")

    u_faces, v_faces = [], []
    for j, i in zip(raw["j"], raw["i"], strict=True):
        if raw["unstagger"]:
            u_faces.append((locate(j, i), locate(j, i - 1)))
            v_faces.append((locate(j, i), locate(j - 1, i)))
        else:
            u_faces.append((locate(j, i),))
            v_faces.append((locate(j, i),))
    return MapLayer(
        id=raw["id"],
        grid=raw["grid"],
        boxes=boxes,
        cells=tuple(raw["cell"]),
        u_faces=tuple(u_faces),
        v_faces=tuple(v_faces),
        cos=tuple(c / 10000 for c in raw["cos"]),
        sin=tuple(s / 10000 for s in raw["sin"]),
    )


# --- The dataset


async def day(settings: Settings, d: date) -> tuple[dict[str, Any], bool]:
    """The `ocean` dataset for the local day `d` (25 hourly frames, both midnights), and whether it
    is complete (every part loaded, SalishSeaCast from the hindcast). Raises `UpstreamError` when
    both parts fail ("no_data" when neither model has that day)."""
    _check_bbox(settings)
    axis = day_axis(d, 3600, include_end=True)
    window = {"start_hour": _hour(axis.t0), "end_hour": _hour(axis.time(axis.n - 1))}
    ssc, glob = await asyncio.gather(
        _ssc(axis, live=False),
        _global(axis, window),
        return_exceptions=True,
    )
    payload = _payload(axis, "replay", d, ssc, glob)
    complete = all(s == "ok" for s in payload["parts"].values()) and ssc[1]
    return payload, complete


async def live(settings: Settings, now: datetime) -> dict[str, Any]:
    """The live `ocean` dataset: hourly from 3 h before the current hour to 6 h after it (10 frames).
    SalishSeaCast is read once per hour, Open-Meteo once per GLOBAL_LIVE_BLOCK_H hours; each part is
    cached on its own, so a retry after a failed part reads only that part (after SSC_RETRY_S or
    meteo_grid.BLOCK_RETRY_S)."""
    _check_bbox(settings)
    axis = meteo_grid.live_axis(now)
    hour = int(now.timestamp()) // 3600

    async def fetch_global(block_axis: Axis, window: dict[str, Any]) -> meteo_grid.Columns:
        return await _global_columns(block_axis, window)

    ssc, glob = await asyncio.gather(
        _ssc_live.get(("ssc", hour), SSC_LIVE_TTL_S, lambda: _ssc(axis, live=True), SSC_RETRY_S),
        meteo_grid.live_block(
            _global_blocks, "global", axis, GLOBAL_LIVE_BLOCK_H, fetch_global, GLOBAL_LIVE_PHASE_H
        ),
        return_exceptions=True,
    )
    if not isinstance(glob, BaseException):
        glob = _global_layer(glob)
    payload = _payload(axis, "live", now.astimezone(LOCAL_TZ).date(), ssc, glob)
    return {**payload, "now": iso_utc(now)}


def _payload(axis: Axis, mode: str, d: date, ssc: Any, glob: Any) -> dict[str, Any]:
    parts = {"ssc": _status(ssc), "global": _status(glob)}
    if all(status != "ok" for status in parts.values()):
        codes = [c for c in parts.values() if c != "no_data"]
        raise UpstreamError(codes[0] if codes else "no_data")
    layers = []
    if parts["ssc"] == "ok":
        layers.extend(ssc[0])
    if parts["global"] == "ok":
        layers.append(glob)
    return {
        "dataset": "ocean",
        "mode": mode,
        "date": d.isoformat(),
        **axis.header(),
        "parts": parts,
        "layers": layers,
        "credit": CREDIT,
    }


def _status(result: Any) -> str:
    if isinstance(result, UpstreamError):
        return "no_data" if result.code == "no_data" else "ocean_unavailable"
    if isinstance(result, BaseException):
        raise result
    return "ok"


def coarsen(body: bytes, stride: int) -> bytes:
    """The payload with the SalishSeaCast grids thinned to every `stride`-th row and column (cells
    `stride` times larger, e.g. for the offline snapshot). The global layer is kept as it is."""
    payload = json.loads(body)
    for layer in payload["layers"]:
        if not layer["id"].startswith("ssc-"):
            continue
        g = layer["grid"]
        rows, cols = range(0, g["nLat"], stride), range(0, g["nLon"], stride)
        keep = [iy * g["nLon"] + ix for iy in rows for ix in cols]
        layer["grid"] = {
            **g,
            "dLat": round(g["dLat"] * stride, 6),
            "dLon": round(g["dLon"] * stride, 6),
            "nLat": len(rows),
            "nLon": len(cols),
        }
        layer["resolutionKm"] = round(layer["resolutionKm"] * stride, 2)
        for key in ("u", "v"):
            layer[key] = [[frame[k] for k in keep] for frame in layer[key]]
    return json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()


def _check_bbox(settings: Settings) -> None:
    g = next(layer.grid for layer in ocean_map().layers if layer.id == "ssc-fine")
    south, _, west, _ = settings.bridge_bbox
    if abs(g["lat0"] - south) > 1e-6 or abs(g["lon0"] - west) > 1e-6:
        log.warning("ssc_map.json was built for another BRIDGE_BBOX; run scripts/build_ssc_map.py")


# --- SalishSeaCast


async def _ssc(axis: Axis, live: bool) -> tuple[list[dict[str, Any]], bool]:
    """Both SalishSeaCast layers on `axis`, and whether they came from the hindcast (final)."""
    start = axis.t0.timestamp() - HALF_HOUR_S
    stop = axis.time(axis.n - 1).timestamp() + HALF_HOUR_S
    try:
        datasets, start, stop, final = await _source(start, stop, live)
        map_layers = ocean_map().layers
        fetched = await asyncio.gather(*(_fetch_layer(datasets, layer, start, stop) for layer in map_layers))
        layers = []
        for layer, (times, u_boxes, v_boxes) in zip(map_layers, fetched, strict=True):
            u, v = _regrid(layer, times, u_boxes, v_boxes, axis)
            layers.append(
                {
                    "id": layer.id,
                    "label": SSC_LABEL,
                    "depth": SSC_DEPTH,
                    "resolutionKm": RESOLUTION_KM[layer.id],
                    "grid": layer.grid,
                    "u": u,
                    "v": v,
                }
            )
    except UpstreamError as exc:
        if exc.code != "no_data":
            log.warning("SalishSeaCast failed: %s", exc.code)
            health.SALISHSEACAST.failure(exc.code)
        raise
    health.SALISHSEACAST.success()
    return layers, final


async def _source(start: float, stop: float, live: bool) -> tuple[tuple[str, str], float, float, bool]:
    """The (u, v) datasets to read [start, stop] from (epoch s), the range clamped to what they hold,
    and whether that is the final hindcast."""
    if not live:
        first, last = await _time_range(HINDCAST[0])
        if first <= start and stop <= last:
            return HINDCAST, start, stop, True
    first, last = await _time_range(FORECAST[0])
    lo, hi = max(start, first), min(stop, last)
    if lo > hi:
        raise UpstreamError("no_data")
    return FORECAST, lo, hi, False


async def _time_range(dataset: str) -> tuple[float, float]:
    async def fetch() -> tuple[float, float]:
        status, body = await get_json(f"{ERDDAP}/info/{dataset}/index.json", {}, timeout_s=30)
        if status != 200:
            raise UpstreamError(f"http_{status}")
        try:
            for kind, var, name, _, value in body["table"]["rows"]:
                if kind == "attribute" and var == "time" and name == "actual_range":
                    first, last = (float(x) for x in value.split(","))
                    return first, last
        except (KeyError, TypeError, ValueError):
            pass
        raise UpstreamError("bad_response")

    return await _ranges.get(dataset, RANGE_TTL_S, fetch)


async def _fetch_layer(
    datasets: tuple[str, str], layer: MapLayer, start: float, stop: float
) -> tuple[list[float], list[array.array], list[array.array]]:
    """The model times and, per box, the u and v values ([time][row][column], flattened)."""
    jobs = [(datasets[k], VARIABLES[k], box) for k in (0, 1) for box in layer.boxes]
    results = await asyncio.gather(*(_fetch_box(ds, var, box, start, stop) for ds, var, box in jobs))
    times = results[0][0]
    if any(r[0] != times for r in results):
        raise UpstreamError("bad_response")
    n_boxes = len(layer.boxes)
    return times, [r[1] for r in results[:n_boxes]], [r[1] for r in results[n_boxes:]]


async def _fetch_box(
    dataset: str, variable: str, box: Box, start: float, stop: float
) -> tuple[list[float], array.array]:
    t0, t1 = (iso_utc(datetime.fromtimestamp(t, timezone.utc)) for t in (start, stop))
    query = f"{variable}[({t0}):1:({t1})][0]{box.query()}"  # [0]: the top level, 0.5 m
    url = f"{ERDDAP}/griddap/{dataset}.dods?{quote(query, safe='():,')}"
    async with _slot():
        started = time.monotonic()
        status, raw = await get_bytes(url, None, timeout_s=ERDDAP_TIMEOUT_S)
    if status == 404:  # "Your query produced no matching results"
        raise UpstreamError("no_data")
    if status != 200:
        raise UpstreamError({429: "rate_limited"}.get(status, f"http_{status}"))
    times, values = _parse_dods(raw, box.size)
    log.info(
        "SalishSeaCast %s %s%s: %d times, %.1f MB in %.1f s",
        dataset, variable, box.query(), len(times), len(raw) / 1e6, time.monotonic() - started,
    )
    return times, values


def _slot() -> asyncio.Semaphore:
    """At most ERDDAP_PARALLEL requests to UBC at a time (one semaphore per event loop)."""
    loop = asyncio.get_running_loop()
    return _slots.setdefault(id(loop), asyncio.Semaphore(ERDDAP_PARALLEL))


def _parse_dods(raw: bytes, points: int) -> tuple[list[float], array.array]:
    """An ERDDAP griddap `.dods` (OPeNDAP DAP2 binary) answer of one Float32 grid variable: after the
    text header and "Data:\\n", the array (its length twice as big-endian uint32, then big-endian
    float32 values), then the map vectors, the first being time (float64, epoch seconds)."""
    marker = b"\nData:\n"
    k = raw.find(marker)
    if k < 0:
        raise UpstreamError("bad_response")
    k += len(marker)
    try:
        (n,) = struct.unpack_from(">I", raw, k)
        k += 8
        values = array.array("f")
        values.frombytes(raw[k : k + 4 * n])
        k += 4 * n
        (n_times,) = struct.unpack_from(">I", raw, k)
        k += 8
        times = array.array("d")
        times.frombytes(raw[k : k + 8 * n_times])
    except (struct.error, ValueError):
        raise UpstreamError("bad_response") from None
    if sys.byteorder == "little":
        values.byteswap()
        times.byteswap()
    if len(values) != n or len(times) != n_times or n != n_times * points:
        raise UpstreamError("bad_response")
    return list(times), values


def _regrid(
    layer: MapLayer, times: list[float], u_boxes: list[array.array], v_boxes: list[array.array], axis: Axis
) -> tuple[list[list[int | None]], list[list[int | None]]]:
    """[n][cells] east and north, int cm/s: each frame is the mean of the model hours before and after."""
    index = {round(t): k for k, t in enumerate(times)}
    sizes = [box.size for box in layer.boxes]
    vectors: dict[int, tuple[list[float | None], list[float | None]]] = {}

    def at(k: int) -> tuple[list[float | None], list[float | None]]:
        if k not in vectors:
            vectors[k] = _vectors(layer, u_boxes, v_boxes, [k * size for size in sizes])
        return vectors[k]

    u_out: list[list[int | None]] = []
    v_out: list[list[int | None]] = []
    for f in range(axis.n):
        t = round(axis.time(f).timestamp())
        hours = [at(index[h]) for h in (t - HALF_HOUR_S, t + HALF_HOUR_S) if h in index]
        u_row: list[int | None] = [None] * layer.n_cells
        v_row: list[int | None] = [None] * layer.n_cells
        for p, cell in enumerate(layer.cells):
            east = [e[p] for e, _ in hours if e[p] is not None]
            north = [n[p] for _, n in hours if n[p] is not None]
            if east and north:
                u_row[cell] = round(100 * sum(east) / len(east))
                v_row[cell] = round(100 * sum(north) / len(north))
        u_out.append(u_row)
        v_out.append(v_row)
    return u_out, v_out


def _vectors(
    layer: MapLayer, u_boxes: list[array.array], v_boxes: list[array.array], base: list[int]
) -> tuple[list[float | None], list[float | None]]:
    """East and north (m/s) at every mapped point for one model time (`base`: its offset per box)."""
    east: list[float | None] = []
    north: list[float | None] = []
    for p in range(len(layer.cells)):
        u = _face_mean(u_boxes, layer.u_faces[p], base)
        v = _face_mean(v_boxes, layer.v_faces[p], base)
        if u is None or v is None:
            east.append(None)
            north.append(None)
            continue
        c, s = layer.cos[p], layer.sin[p]
        east.append(u * c - v * s)
        north.append(u * s + v * c)
    return east, north


def _face_mean(boxes: list[array.array], faces: Sequence[Face], base: list[int]) -> float | None:
    """Mean of the face values; a missing face next to a valid one is a wall (0)."""
    total, valid = 0.0, 0
    for b, off in faces:
        value = boxes[b][base[b] + off]
        if math.isfinite(value) and abs(value) < FILL_ABOVE:
            total += value
            valid += 1
    return total / len(faces) if valid else None


# --- Global (Open-Meteo Marine)


async def _global(axis: Axis, window: dict[str, Any]) -> dict[str, Any]:
    return _global_layer(await _global_columns(axis, window))


async def _global_columns(axis: Axis, window: dict[str, Any]) -> meteo_grid.Columns:
    m = ocean_map()
    g = m.global_grid
    points = [
        (round(g["lat0"] + (k // g["nLon"]) * g["dLat"], 4), round(g["lon0"] + (k % g["nLon"]) * g["dLon"], 4))
        for k in m.global_cells
    ]
    extra = {"cell_selection": "sea"}
    url = meteo_grid.MARINE_URL
    return await meteo_grid.hourly(url, points, GLOBAL_VARS, window, axis, extra, health.OPENMETEO)


def _global_layer(columns: meteo_grid.Columns) -> dict[str, Any]:
    m = ocean_map()
    n_cells = m.global_grid["nLat"] * m.global_grid["nLon"]
    u_out, v_out = [], []
    for speeds, towards in zip(columns["speed"], columns["toward"], strict=True):
        u_row: list[int | None] = [None] * n_cells
        v_row: list[int | None] = [None] * n_cells
        for cell, speed, toward in zip(m.global_cells, speeds, towards, strict=True):
            if speed is not None and toward is not None:
                a = math.radians(toward)
                u_row[cell] = round(speed * math.sin(a))
                v_row[cell] = round(speed * math.cos(a))
        u_out.append(u_row)
        v_out.append(v_row)
    return {
        "id": "global",
        "label": GLOBAL_LABEL,
        "depth": GLOBAL_DEPTH,
        "resolutionKm": RESOLUTION_KM["global"],
        "grid": m.global_grid,
        "u": u_out,
        "v": v_out,
    }


def _hour(dt: datetime) -> str:
    return iso_utc(dt)[:16]  # "2026-08-17T07:00" (Open-Meteo, timezone=GMT)
