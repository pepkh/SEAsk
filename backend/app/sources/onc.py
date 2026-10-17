"""Latest ship readings from Ocean Networks Canada (Oceans 3.0 API, `scalardata/location`).

One request per (location, device category) in `onc_sensors.json`, all in parallel. A group
that fails only nulls its own columns; the NAV group (position) is required. The NAV group
(position, course, speed, heading, roll) is read at most every ONC_NAV_CACHE_S, the other groups
every ONC_CACHE_S. A column's `fallback` group is only requested when its first sensor has no value.

The ONC token travels in the query string (ONC responses even echo it in `queryUrl`), so URLs
and response bodies are never logged, and API error text is redacted before logging.
"""

import asyncio
import json
import logging
import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.http import UpstreamError, get_json, redact
from app.times import parse_iso, utc_now

log = logging.getLogger(__name__)

SENSORS_FILE = Path(__file__).with_name("onc_sensors.json")

# ONC QC flags to drop: 3 probably bad, 4 bad, 6 bad down-sampling, 9 missing.
QC_DROP = {3, 4, 6, 9}

# Lower-cased unitOfMeasure spellings -> canonical unit.
UNIT_ALIASES = {
    "c": "C", "degc": "C", "celsius": "C",
    "k": "K", "kelvin": "K",
    "f": "F", "degf": "F",
    "m/s": "m/s", "ms-1": "m/s", "m.s-1": "m/s", "mps": "m/s",
    "kn": "kn", "kt": "kn", "kts": "kn", "knot": "kn", "knots": "kn",
    "km/h": "km/h", "kph": "km/h",
    "hpa": "hPa", "mbar": "hPa", "mb": "hPa", "millibar": "hPa",
    "pa": "Pa", "kpa": "kPa", "bar": "bar", "dbar": "dbar", "decibar": "dbar", "inhg": "inHg",
}

CONVERSIONS: dict[tuple[str, str], Callable[[float], float]] = {
    ("m/s", "kn"): lambda v: v * 1.943844,
    ("km/h", "kn"): lambda v: v / 1.852,
    ("Pa", "hPa"): lambda v: v / 100,
    ("kPa", "hPa"): lambda v: v * 10,
    ("bar", "hPa"): lambda v: v * 1000,
    ("dbar", "hPa"): lambda v: v * 100,
    ("inHg", "hPa"): lambda v: v * 33.8639,
    ("K", "C"): lambda v: v - 273.15,
    ("F", "C"): lambda v: (v - 32) * 5 / 9,
}

# Optional per-column changes, applied after the unit conversion (`transform` in onc_sensors.json).
TRANSFORMS: dict[str, Callable[[float, Settings], float]] = {
    # Magnetic to true bearing. MAGNETIC_DECLINATION_DEG is east-positive.
    "magnetic_to_true": lambda v, s: round((v + s.magnetic_declination_deg) % 360, 2),
}


@dataclass(frozen=True)
class Column:
    name: str
    location: str  # "nav", "ship" or a literal ONC locationCode
    device_category: str
    codes: tuple[str, ...]  # candidate sensorCategoryCodes, first match wins
    unit: str | None  # target unit; None passes the value through
    check_age: bool
    transform: str | None = None  # a TRANSFORMS key
    fallback: "Column | None" = None  # read only when this sensor gives no value


@dataclass(frozen=True)
class Sample:
    value: Any
    time: datetime
    unit: str | None


@dataclass(frozen=True)
class Snapshot:
    """One ONC read. `values` has every mapped column, None when missing, bad or too old."""

    position_time: datetime | None
    values: dict[str, Any]


_cache = TTLCache(max_entries=4)  # the assembled snapshot, for ONC_NAV_CACHE_S
_group_cache = TTLCache(max_entries=32)  # non-NAV groups, for ONC_CACHE_S
# The newest read with a position. ONC's latest NAV sample now and then has no usable position;
# this read is served instead until it is older than ONC_MAX_POSITION_AGE_S (the route checks the age).
_last_good: Snapshot | None = None
_unit_warnings: set[tuple[str, str | None]] = set()


@lru_cache
def load_columns() -> tuple[Column, ...]:
    columns = json.loads(SENSORS_FILE.read_text())["columns"]
    return tuple(_parse_column(name, spec) for name, spec in columns.items())


def _parse_column(name: str, spec: dict) -> Column:
    transform = spec.get("transform")
    if transform is not None and transform not in TRANSFORMS:
        raise RuntimeError(f"onc_sensors.json {name}: unknown transform {transform!r}")
    return Column(
        name=name,
        location=spec["location"],
        device_category=spec["deviceCategory"],
        codes=tuple(_as_list(spec["sensorCategoryCode"])),
        unit=spec.get("unit"),
        check_age=spec.get("checkAge", True),
        transform=transform,
        fallback=_parse_column(name, spec["fallback"]) if spec.get("fallback") else None,
    )


async def latest(settings: Settings) -> Snapshot:
    """Newest readings, cached for ONC_NAV_CACHE_S (the non-NAV groups for ONC_CACHE_S).

    Raises `UpstreamError` when NAV cannot be read.
    """
    return await _cache.get("latest", settings.onc_nav_cache_s, lambda: _fetch(settings))


async def _fetch(settings: Settings) -> Snapshot:
    global _last_good
    columns = load_columns()
    nav = next(_group(settings, c) for c in columns if c.name == "latitude")
    samples, failed = await _read_groups(settings, {_group(settings, c) for c in columns}, nav)
    if nav in failed:
        health.ONC.failure(failed[nav])
        raise UpstreamError(failed[nav])

    found = {c.name: s for c in columns if (s := _pick(settings, c, samples)) is not None}
    lat, lon = found.get("latitude"), found.get("longitude")
    position_ok = lat is not None and lon is not None and _is_number(lat.value) and _is_number(lon.value)
    position_time = lat.time if position_ok else None
    values = {c.name: _value(c, found.get(c.name), position_time, settings) for c in columns}

    # Fallback sensors, e.g. the magnetic heading when NAV has no true heading.
    pending = [c.fallback for c in columns if values[c.name] is None and c.fallback is not None]
    if pending:
        more, more_failed = await _read_groups(settings, {_group(settings, c) for c in pending}, nav)
        samples.update(more)
        failed.update(more_failed)
        for c in pending:
            values[c.name] = _value(c, _pick(settings, c, samples), position_time, settings)

    if position_time is None:
        health.ONC.failure("no_position")
        if _last_good is not None:
            return _last_good
    elif (utc_now() - position_time).total_seconds() > settings.onc_max_position_age_s:
        health.ONC.failure("stale")
    elif failed:
        health.ONC.success(warning="partial:" + ",".join(sorted(cat for _, cat in failed)))
    else:
        health.ONC.success()
    snapshot = Snapshot(position_time=position_time, values=values)
    if position_time is not None:
        _last_good = snapshot
    return snapshot


async def _read_groups(
    settings: Settings, groups: set[tuple[str, str]], nav: tuple[str, str]
) -> tuple[dict[tuple[str, str], dict[str, Sample]], dict[tuple[str, str], str]]:
    """Samples per group, and the error code of each group that failed. NAV is always read fresh
    (the whole snapshot is cached for ONC_NAV_CACHE_S); the other groups for ONC_CACHE_S."""
    ordered = sorted(groups)
    results = await asyncio.gather(
        *(
            _fetch_group(settings, *group)
            if group == nav
            else _group_cache.get(group, settings.onc_cache_s, lambda g=group: _fetch_group(settings, *g))
            for group in ordered
        ),
        return_exceptions=True,
    )
    samples: dict[tuple[str, str], dict[str, Sample]] = {}
    failed: dict[tuple[str, str], str] = {}
    for group, result in zip(ordered, results, strict=True):
        if isinstance(result, UpstreamError):
            failed[group] = result.code
        elif isinstance(result, BaseException):
            raise result
        else:
            samples[group] = result
    return samples, failed


def _pick(
    settings: Settings, column: Column, samples: dict[tuple[str, str], dict[str, Sample]]
) -> Sample | None:
    """The column's sample: the first of its sensorCategoryCodes that its group returned."""
    group = samples.get(_group(settings, column), {})
    return next((group[code] for code in column.codes if code in group), None)


async def _fetch_group(settings: Settings, location: str, category: str) -> dict[str, Sample]:
    """Latest good sample per sensorCategoryCode for one device category at one location."""
    status, body = await get_json(
        f"{settings.onc_base_url}/scalardata/location",
        {
            "locationCode": location,
            "deviceCategoryCode": category,
            "getLatest": "true",
            "rowLimit": 1,
            "token": settings.onc_token,
        },
    )
    if status == 200 and isinstance(body, dict):
        return _latest_samples(body)

    errors = _api_errors(body)
    error_codes = {e.get("errorCode") for e in errors}
    if status == 404 or (status == 400 and error_codes == {127}):
        # 127 "Invalid parameter value": no data in range, or an unknown location/category.
        log.info("ONC %s@%s: no data (%s)", category, location, _describe(errors, settings))
        return {}
    if status == 401 or 128 in error_codes:
        code = "auth"
    elif status == 429:
        code = "rate_limited"
    elif status == 200:
        code = "bad_response"
    else:
        code = f"http_{status}"
    log.warning("ONC %s@%s failed: %s (%s)", category, location, code, _describe(errors, settings))
    raise UpstreamError(code)


def _latest_samples(body: dict) -> dict[str, Sample]:
    out: dict[str, Sample] = {}
    for sensor in body.get("sensorData") or []:
        if not isinstance(sensor, dict) or not isinstance(sensor.get("data"), dict):
            continue
        code = sensor.get("sensorCategoryCode")
        sample = _newest_good(sensor["data"], sensor.get("unitOfMeasure"))
        if code and sample is not None and (code not in out or sample.time > out[code].time):
            out[code] = sample
    return out


def _newest_good(data: dict, unit: str | None) -> Sample | None:
    """The newest sample that has a value, a time and a usable QC flag."""
    times = data.get("sampleTimes") or []
    values = data.get("values") or []
    flags = data.get("qaqcFlags") or []
    for i in reversed(range(min(len(times), len(values)))):
        value = values[i]
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        if i < len(flags) and _as_int(flags[i]) in QC_DROP:
            continue
        time = parse_iso(times[i])
        if time is not None:
            return Sample(value=value, time=time, unit=unit)
    return None


def _value(column: Column, sample: Sample | None, position_time: datetime | None, settings: Settings) -> Any:
    """The column's output value: converted, or None when missing or too old."""
    if sample is None:
        return None
    if (
        column.check_age
        and position_time is not None
        and (position_time - sample.time).total_seconds() > settings.onc_max_sensor_age_s
    ):
        return None
    value = sample.value
    if isinstance(value, bool):
        value = int(value)
    if not _is_number(value):
        return None if column.unit or column.transform else value  # e.g. a status string
    if column.unit is not None:
        value = _convert(column.name, float(value), sample.unit, column.unit)
    if column.transform is not None and value is not None:
        value = TRANSFORMS[column.transform](float(value), settings)
    return value


def _convert(name: str, value: float, from_unit: str | None, to_unit: str) -> float | None:
    src, dst = _canonical_unit(from_unit), _canonical_unit(to_unit)
    if src == dst:
        return value
    convert = CONVERSIONS.get((src, dst))
    if convert is None:
        if (name, from_unit) not in _unit_warnings:
            _unit_warnings.add((name, from_unit))
            log.warning("ONC %s: no conversion from %r to %r; value dropped", name, from_unit, to_unit)
        return None
    return round(convert(value), 3)


def _canonical_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    key = unit.strip().lower().replace("°", "").replace("deg ", "").replace(" ", "")
    return UNIT_ALIASES.get(key, key)


def _group(settings: Settings, column: Column) -> tuple[str, str]:
    location = {"nav": settings.onc_nav_location_code, "ship": settings.onc_location_code}.get(
        column.location, column.location
    )
    return location, column.device_category


def _api_errors(body: Any) -> list[dict]:
    errors = body.get("errors") if isinstance(body, dict) else None
    return [e for e in errors if isinstance(e, dict)] if isinstance(errors, list) else []


def _describe(errors: list[dict], settings: Settings) -> str:
    """API errors as short text with the token redacted. Never includes the URL."""
    text = "; ".join(
        f"{e.get('errorCode')} {e.get('parameter')}: {e.get('errorMessage')}" for e in errors
    )
    return redact(text or "no error body", settings.onc_token)


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else [value]


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
