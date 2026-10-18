"""Live surface currents from ONC's Strait of Georgia CODAR (HF radar): the live `currents` dataset.

ONC archives one total-vector file per hour (`STRAITOFGEORGIAARRAY_20261017T220000.000Z.tuv`,
about an hour after its time stamp). `live()` lists the files of the last hours
(`archivefile/location`), downloads the newest LIVE_HOURS of them (`archivefile/download`, server
side only: the token is in the query string) and parses them.

The files are CODAR LLUV text: `%Key: value` metadata, then a table between `%TableStart:` and
`%TableEnd:` whose columns are named in `%TableColumnTypes:`. Used here:
- LOND, LATD: cell centre; VELU, VELV: eastward and northward velocity, cm/s.
- XDST, YDST: km east and north of `%Origin` on the regular grid of `%GridSpacing` km (1 km), which
  gives each cell's ix, iy. Without them, ix/iy come from km offsets from the south-west cell.
- UQAL, VQAL (999 = missing) and VFLG (non-zero = flagged by the combiner): such cells are dropped,
  as are speeds over MAX_SPEED_CM_S.
- the MRGS table (`%TableType: MRGS`) lists the radar sites that contributed.

Each parsed file is cached for 24 h; the listing for BRIDGE_LIVE_CACHE_S.
"""

import asyncio
import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, NoReturn

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.frames import Axis
from app.http import UpstreamError, get_json, get_text
from app.sources import onc
from app.times import LOCAL_TZ, iso_utc

log = logging.getLogger(__name__)

DEVICE_CATEGORY = "OCEANOGRAPHICRADAR"
CREDIT = "Ocean Networks Canada (Strait of Georgia CODAR)"
LIVE_HOURS = 6  # frames sent: the newest file and the hours before it
LIST_HOURS = 9  # how far back to look for files (they arrive about an hour late)
FILE_TTL_S = 24 * 3600
MAX_SPEED_CM_S = 220.0
QUALITY_MISSING = 999.0
KM_PER_DEG_LAT = 111.32
# ONC location names of the radar sites (`locations?locationCode=SOGCS&includeChildren=true`).
SITE_NAMES = {
    "VATK": "Point Atkinson",
    "VCOL": "Westshore Coal Terminal",
    "VGPT": "Georgina Point",
    "VSPT": "Iona Spit",
    "VION": "Iona",
}
FILE_TIME = re.compile(r"_(\d{8}T\d{6})\.\d{3}Z\.tuv$")
SITE_ROW = re.compile(r'^%\s*\d+\s+"(\w+)"\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)')

_listing = TTLCache(max_entries=4)
_files = TTLCache(max_entries=64)


@dataclass(frozen=True)
class Cell:
    lat: float
    lon: float
    u: float  # cm/s east
    v: float  # cm/s north
    x_km: float | None
    y_km: float | None


@dataclass(frozen=True)
class TotalsFile:
    time: datetime
    spacing_km: float
    cells: tuple[Cell, ...]
    sites: tuple[tuple[str, float, float], ...]  # (code, lat, lon)


async def live(settings: Settings, now: datetime) -> dict[str, Any]:
    """The newest LIVE_HOURS hourly frames. Raises `UpstreamError` ("no_data" without recent files)."""
    files = await _listing.get("files", settings.bridge_live_cache_s, lambda: _list(settings, now))
    if not files:
        raise UpstreamError("no_data")
    newest = files[-1][0]
    axis = Axis(newest - timedelta(hours=LIVE_HOURS - 1), 3600, LIVE_HOURS)
    wanted = [(t, name) for t, name in files if axis.nearest(t) is not None]
    results = await asyncio.gather(
        *(_files.get(name, FILE_TTL_S, lambda name=name: _fetch(settings, name)) for _, name in wanted),
        return_exceptions=True,
    )
    parsed = []
    for (_, name), result in zip(wanted, results, strict=True):
        if isinstance(result, UpstreamError):
            log.warning("CODAR %s skipped: %s", name, result.code)
        elif isinstance(result, BaseException):
            raise result
        else:
            parsed.append(result)
    if not parsed:
        raise UpstreamError("no_data")
    return {**payload(parsed, axis, "live", now.astimezone(LOCAL_TZ).date().isoformat()), "now": iso_utc(now)}


def payload(files: list[TotalsFile], axis: Axis, mode: str, day: str) -> dict[str, Any]:
    """The `currents` shape: cells with data in any frame, `u`/`v` as [n][cells] int cm/s."""
    spacing = files[0].spacing_km
    keyed = [(f, [(_grid_xy(c, f, spacing), c) for c in f.cells]) for f in files]
    first: dict[tuple[int, int], Cell] = {}
    for _, cells in keyed:
        for xy, cell in cells:
            first.setdefault(xy, cell)
    if not first:
        raise UpstreamError("no_data")
    min_x = min(x for x, _ in first)
    min_y = min(y for _, y in first)
    order = sorted(first, key=lambda xy: (xy[1], xy[0]))  # south row first, then west to east
    index = {xy: k for k, xy in enumerate(order)}

    u: list[list[int | None]] = [[None] * len(order) for _ in range(axis.n)]
    v: list[list[int | None]] = [[None] * len(order) for _ in range(axis.n)]
    sites: dict[str, tuple[float, float]] = {}
    for f, cells in keyed:
        i = axis.nearest(f.time)
        if i is None:
            continue
        for xy, cell in cells:
            u[i][index[xy]] = round(cell.u)
            v[i][index[xy]] = round(cell.v)
        for code, lat, lon in f.sites:
            sites.setdefault(code, (lat, lon))

    ix = [x - min_x for x, _ in order]
    iy = [y - min_y for _, y in order]
    lat = [first[xy].lat for xy in order]
    lon = [first[xy].lon for xy in order]
    origin_lat = _fit_origin(ix, iy, lat)
    origin_lon = _fit_origin(ix, iy, lon)
    return {
        "dataset": "currents",
        "mode": mode,
        "date": day,
        **axis.header(),
        "unit": "cm/s",
        "grid": {
            "originLat": round(origin_lat, 5),
            "originLon": round(origin_lon, 5),
            "dxKm": spacing,
            "nx": max(ix) + 1,
            "ny": max(iy) + 1,
        },
        "cells": {"ix": ix, "iy": iy, "lat": [round(x, 5) for x in lat], "lon": [round(x, 5) for x in lon]},
        "u": u,
        "v": v,
        "sites": [
            {"code": code, "name": SITE_NAMES.get(code, code), "lat": round(la, 5), "lon": round(lo, 5)}
            for code, (la, lo) in sorted(sites.items())
        ],
        "credit": CREDIT,
    }


# --- ONC archive files


async def _list(settings: Settings, now: datetime) -> list[tuple[datetime, str]]:
    """(time, filename) of the .tuv files of the last LIST_HOURS, oldest first."""
    status, body = await get_json(
        f"{settings.onc_base_url}/archivefile/location",
        {
            "locationCode": settings.onc_codar_location_code,
            "deviceCategoryCode": DEVICE_CATEGORY,
            "fileExtension": "tuv",
            "dateFrom": iso_utc(now - timedelta(hours=LIST_HOURS), "milliseconds"),
            "dateTo": iso_utc(now, "milliseconds"),
            "token": settings.onc_token,
        },
    )
    if status == 400 and {e.get("errorCode") for e in onc._api_errors(body)} == {127}:
        return []  # no radar deployed in the window
    if status != 200 or not isinstance(body, dict):
        _fail(status, body, settings, "list")
    out = []
    for name in body.get("files") or []:
        match = FILE_TIME.search(name) if isinstance(name, str) else None
        if match:
            out.append((datetime.strptime(match.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc), name))
    health.CODAR.success()
    return sorted(out)


async def _fetch(settings: Settings, name: str) -> TotalsFile:
    status, body = await get_text(
        f"{settings.onc_base_url}/archivefile/download", {"filename": name, "token": settings.onc_token}
    )
    if status != 200:
        _fail(status, None, settings, "download")
    try:
        parsed = parse_lluv(body)
    except ValueError as exc:
        log.warning("CODAR %s: unreadable (%s)", name, exc)
        health.CODAR.failure("bad_file")
        raise UpstreamError("bad_file") from None
    health.CODAR.success()
    return parsed


def _fail(status: int, body: Any, settings: Settings, what: str) -> NoReturn:
    errors = onc._api_errors(body)
    error_codes = {e.get("errorCode") for e in errors}
    code = "auth" if status == 401 or 128 in error_codes else {429: "rate_limited"}.get(status, f"http_{status}")
    log.warning("ONC CODAR %s failed: %s (%s)", what, code, onc._describe(errors, settings))
    health.CODAR.failure(code)
    raise UpstreamError(code)


# --- LLUV parsing


def parse_lluv(text: str) -> TotalsFile:
    """The total vectors of one LLUV file. Raises `ValueError` when it has no time or no table."""
    stamp = spacing = None
    columns: list[str] = []
    lluv_columns: list[str] = []
    table = ""
    in_table = False
    rows: list[list[str]] = []
    sites: list[tuple[str, float, float]] = []
    for line in text.splitlines():
        if not line.startswith("%"):
            if in_table and table.startswith("LLUV") and line.strip():
                rows.append(line.split())
            continue
        if line.startswith("%%"):
            continue
        key, _, value = line[1:].partition(":")
        key, value = key.strip(), value.strip()
        if key == "TimeStamp":
            stamp = datetime.strptime(" ".join(value.split()[:6]), "%Y %m %d %H %M %S")
            stamp = stamp.replace(tzinfo=timezone.utc)
        elif key == "GridSpacing":
            spacing = float(value.split()[0])
        elif key == "TableType":
            table, columns = value, []
        elif key == "TableColumnTypes":
            columns = value.split()
        elif key == "TableStart":
            in_table = True
            if table.startswith("LLUV"):
                lluv_columns = columns
        elif key == "TableEnd":
            in_table = False
        elif in_table and table.startswith("MRGS") and (site := SITE_ROW.match(line)):
            sites.append((site.group(1), float(site.group(2)), float(site.group(3))))
    if stamp is None or not rows:
        raise ValueError("no time stamp or no LLUV table")
    col = {name: k for k, name in enumerate(lluv_columns)}
    if not {"LOND", "LATD", "VELU", "VELV"} <= col.keys():
        raise ValueError("LLUV table without LOND LATD VELU VELV")
    cells = [c for row in rows if (c := _cell(row, col)) is not None]
    return TotalsFile(time=stamp, spacing_km=spacing or 1.0, cells=tuple(cells), sites=tuple(sites))


def _cell(row: list[str], col: dict[str, int]) -> Cell | None:
    def num(name: str) -> float | None:
        k = col.get(name)
        if k is None or k >= len(row):
            return None
        try:
            v = float(row[k])
        except ValueError:
            return None
        return v if math.isfinite(v) else None

    lon, lat, u, v = num("LOND"), num("LATD"), num("VELU"), num("VELV")
    if None in (lon, lat, u, v):
        return None
    if num("UQAL") == QUALITY_MISSING or num("VQAL") == QUALITY_MISSING:
        return None
    if (num("VFLG") or 0) != 0 or math.hypot(u, v) > MAX_SPEED_CM_S:
        return None
    return Cell(lat=lat, lon=lon, u=u, v=v, x_km=num("XDST"), y_km=num("YDST"))


def _grid_xy(cell: Cell, f: TotalsFile, spacing: float) -> tuple[int, int]:
    """Integer grid position of a cell: from XDST/YDST, else from km offsets of the lat/lon."""
    if cell.x_km is not None and cell.y_km is not None:
        return round(cell.x_km / spacing), round(cell.y_km / spacing)
    lat0 = min(c.lat for c in f.cells)
    lon0 = min(c.lon for c in f.cells)
    km_per_deg_lon = KM_PER_DEG_LAT * math.cos(math.radians(lat0))
    return round((cell.lon - lon0) * km_per_deg_lon / spacing), round((cell.lat - lat0) * KM_PER_DEG_LAT / spacing)


def _fit_origin(ix: list[int], iy: list[int], values: list[float]) -> float:
    """The value at ix = iy = 0 of the least-squares plane `a + b*ix + c*iy` through the cells
    (the grid is regular in km, so lat and lon are close to linear in ix and iy)."""
    n = len(values)
    sx, sy, sz = sum(ix), sum(iy), sum(values)
    sxx = sum(x * x for x in ix)
    syy = sum(y * y for y in iy)
    sxy = sum(x * y for x, y in zip(ix, iy, strict=True))
    sxz = sum(x * z for x, z in zip(ix, values, strict=True))
    syz = sum(y * z for y, z in zip(iy, values, strict=True))
    m = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]]
    det = _det3(m)
    if abs(det) < 1e-9:  # a single row or column of cells: take the south-west cell
        return values[0]
    return _det3([[sz, sx, sy], [sxz, sxx, sxy], [syz, sxy, syy]]) / det


def _det3(m: list[list[float]]) -> float:
    return (
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    )
