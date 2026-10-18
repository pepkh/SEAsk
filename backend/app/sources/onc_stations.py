"""ONC observatories near the route and the second ONC ferry: the bridge `stations` dataset.

Which sensors are read is set in `onc_stations.json`: the VENUS nodes SCVIP and SEVIP (deep water
CTD, oxygen, optics, a current meter), the IONA shore station (wind, pressure) and the TWDP ferry
(Tsawwassen - Duke Point: 1-minute track and surface water).

One `scalardata/location` request per (location, device category, avg or raw), all in parallel:
- `avg` series use ONC's `resampleType=avg` at the step (sample times are the middle of each step).
- angles and gusts read the raw samples (paged with `next`) and are aggregated here: wind direction
  is the direction of the speed-weighted mean vector (the plain vane mean when the speed is 0 all
  step), heading and course the newest sample of the
  step, gusts the largest sample. ONC's avg would average 350° and 10° to 180°.
QC: samples with ONC flags in `onc.QC_DROP` are dropped (ONC sends them as NaN).

Each station is one part: "ok" (some data, no failed request), "no_data" (ONC has nothing for it:
error 127 or only bad samples) or `onc_auth` / `onc_down` when a request failed (what did load is
still sent). Health goes to `health.ONC_STATIONS`, never to the ship's `health.ONC`. The token is in
the query string, so URLs and bodies are never logged; API errors are redacted (`onc._describe`).
"""

import asyncio
import json
import logging
import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from app import health
from app.config import Settings
from app.frames import Axis, day_axis, rnd
from app.http import UpstreamError, get_json
from app.sources import onc
from app.times import LOCAL_TZ, iso_utc

log = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).with_name("onc_stations.json")
CREDIT = "Ocean Networks Canada"
REPLAY_STEP_S = 600
LIVE_STEP_S = 300
LIVE_HOURS = 3
RAW_AGGREGATES = {"mean", "max", "newest", "vector"}
MAX_PARALLEL = 8  # requests in flight to ONC at once


@dataclass(frozen=True)
class Series:
    key: str  # payload key
    location: str
    device_category: str
    code: str  # sensorCategoryCode
    unit: str | None
    digits: int
    aggregate: str  # "avg" or one of RAW_AGGREGATES
    weight: str | None = None  # sensorCategoryCode weighting a "vector" series

    @property
    def raw(self) -> bool:
        return self.aggregate != "avg"


@dataclass(frozen=True)
class Station:
    code: str
    name: str
    kind: str
    lat: float | None
    lon: float | None
    depth_m: float | None
    series: tuple[Series, ...]


@dataclass(frozen=True)
class Config:
    stations: tuple[Station, ...]
    twdp: Station
    twdp_step_s: int


Request = tuple[str, str, str, bool]  # (station code, locationCode, deviceCategoryCode, raw)
Readings = dict[str, list[onc.Sample]]  # sensorCategoryCode -> good samples, oldest first


@lru_cache
def load_config() -> Config:
    spec = json.loads(CONFIG_FILE.read_text())
    stations = tuple(_parse_station(code, s) for code, s in spec["stations"].items())
    twdp = spec["twdp"]
    return Config(stations, _parse_station(twdp["code"], twdp), int(twdp["stepS"]))


def _parse_station(code: str, spec: dict) -> Station:
    series = []
    for key, s in spec["series"].items():
        aggregate = s.get("aggregate", "avg")
        if aggregate != "avg" and aggregate not in RAW_AGGREGATES:
            raise RuntimeError(f"onc_stations.json {code}.{key}: unknown aggregate {aggregate!r}")
        series.append(
            Series(
                key=key,
                location=s.get("location", code),
                device_category=s["deviceCategory"],
                code=s["sensorCategoryCode"],
                unit=s.get("unit"),
                digits=int(s.get("digits", 2)),
                aggregate=aggregate,
                weight=s.get("weight"),
            )
        )
    return Station(
        code=code,
        name=spec.get("name", code),
        kind=spec.get("kind", "node"),
        lat=spec.get("lat"),
        lon=spec.get("lon"),
        depth_m=spec.get("depthM"),
        series=tuple(series),
    )


async def day(settings: Settings, d: date) -> dict[str, Any]:
    """The `stations` dataset for the local day `d`: 10-minute steps, TWDP at 1 minute."""
    config = load_config()
    return await _build(
        settings,
        day_axis(d, REPLAY_STEP_S),
        day_axis(d, config.twdp_step_s),
        settings.bridge_day_timeout_s,
        "replay",
        d,
    )


async def live(settings: Settings, now: datetime) -> dict[str, Any]:
    """The last LIVE_HOURS in 5-minute steps (TWDP at 1 minute), up to the last whole step."""
    config = load_config()
    end = datetime.fromtimestamp(live_window_end(now), timezone.utc)
    start = end - timedelta(hours=LIVE_HOURS)
    seconds = LIVE_HOURS * 3600
    payload = await _build(
        settings,
        Axis(start, LIVE_STEP_S, seconds // LIVE_STEP_S),
        Axis(start, config.twdp_step_s, seconds // config.twdp_step_s),
        None,
        "live",
        now.astimezone(LOCAL_TZ).date(),
    )
    return {**payload, "now": iso_utc(now)}


def live_window_end(now: datetime) -> int:
    """Epoch seconds of the live window end: the cache key of `live()`."""
    return math.floor(now.timestamp() / LIVE_STEP_S) * LIVE_STEP_S


async def _build(
    settings: Settings, axis: Axis, twdp_axis: Axis, timeout_s: float | None, mode: str, d: date
) -> dict[str, Any]:
    """Raises `UpstreamError` when no station has data: "no_data" when ONC has nothing, else the
    first failure ("auth", "timeout", ...)."""
    config = load_config()
    stations = (*config.stations, config.twdp)
    axes = {s.code: axis for s in config.stations} | {config.twdp.code: twdp_axis}
    requests: dict[Request, set[str]] = {}
    for station in stations:
        for s in station.series:
            codes = requests.setdefault((station.code, s.location, s.device_category, s.raw), set())
            codes.update(c for c in (s.code, s.weight) if c)

    limit = asyncio.Semaphore(MAX_PARALLEL)
    keys = list(requests)
    results = await asyncio.gather(
        *(_read(settings, limit, key, requests[key], axes[key[0]], timeout_s) for key in keys),
        return_exceptions=True,
    )
    by_request = dict(zip(keys, results, strict=True))

    parts: dict[str, str] = {}
    errors: list[str] = []
    out_stations: list[dict[str, Any]] = []
    twdp = None
    for station in stations:
        st_axis = axes[station.code]
        failed = []
        columns = {}
        for s in station.series:
            result = by_request[(station.code, s.location, s.device_category, s.raw)]
            if isinstance(result, UpstreamError):
                failed.append(result.code)
                result = {}
            elif isinstance(result, BaseException):
                raise result
            columns[s.key] = _column(s, result, st_axis)
        present = {k: v for k, v in columns.items() if any(x is not None for x in v)}
        if failed:
            parts[station.code] = "onc_auth" if "auth" in failed else "onc_down"
            errors.extend(failed)
        else:
            parts[station.code] = "ok" if present else "no_data"
        if station is config.twdp:
            twdp = {**st_axis.header(), **columns} if present else None
        else:
            out_stations.append(
                {
                    "code": station.code,
                    "name": station.name,
                    "kind": station.kind,
                    "lat": station.lat,
                    "lon": station.lon,
                    "depthM": station.depth_m,
                    "series": present,
                }
            )

    _record_health(parts, errors)
    if twdp is None and not any(s["series"] for s in out_stations):
        raise UpstreamError(("auth" if "auth" in errors else errors[0]) if errors else "no_data")
    return {
        "dataset": "stations",
        "mode": mode,
        "date": d.isoformat(),
        **axis.header(),
        "parts": parts,
        "stations": out_stations,
        "twdp": twdp,
        "credit": CREDIT,
    }


def _record_health(parts: dict[str, str], errors: list[str]) -> None:
    failed = sorted(code for code, p in parts.items() if p.startswith("onc_"))
    if not failed:
        health.ONC_STATIONS.success()
    elif len(failed) < len(parts):
        health.ONC_STATIONS.success(warning="partial:" + ",".join(failed))
    else:
        health.ONC_STATIONS.failure("auth" if "auth" in errors else errors[0])


async def _read(
    settings: Settings,
    limit: asyncio.Semaphore,
    key: Request,
    codes: set[str],
    axis: Axis,
    timeout_s: float | None,
) -> Readings:
    """Good samples of `codes` over the axis: resampled (avg) or raw, following the `next` pages."""
    _, location, category, raw = key
    params: dict[str, Any] = {
        "dateFrom": iso_utc(axis.t0, "milliseconds"),
        "dateTo": iso_utc(axis.time(axis.n), "milliseconds"),
        "sensorCategoryCodes": ",".join(sorted(codes)),
        "rowLimit": onc.HISTORY_ROW_LIMIT,
    }
    if not raw:
        params |= {"resampleType": "avg", "resamplePeriod": axis.step_s}
    out: Readings = {}
    async with limit:
        for _ in range(onc.HISTORY_MAX_PAGES):
            body = await _request(settings, location, category, params, timeout_s)
            for code, data, unit in onc._sensors(body):
                if code in codes:
                    out.setdefault(code, []).extend(onc._good_samples(data, unit))
            date_from = onc._next_date_from(body, params["dateFrom"])
            if date_from is None:
                return out
            params = {**params, "dateFrom": date_from}
    log.warning("ONC %s@%s: cut after %d pages", category, location, onc.HISTORY_MAX_PAGES)
    return out


async def _request(
    settings: Settings, location: str, category: str, params: dict[str, Any], timeout_s: float | None
) -> dict:
    """`onc._request` with a timeout: whole-day reads can take longer than HTTP_TIMEOUT_S, and
    `onc._request` has no timeout parameter. {} when ONC has no data (error 127 or 404)."""
    status, body = await get_json(
        f"{settings.onc_base_url}/scalardata/location",
        {"locationCode": location, "deviceCategoryCode": category, **params, "token": settings.onc_token},
        timeout_s=timeout_s,
    )
    if status == 200 and isinstance(body, dict):
        return body
    errors = onc._api_errors(body)
    error_codes = {e.get("errorCode") for e in errors}
    if status == 404 or (status == 400 and error_codes == {127}):
        log.info("ONC %s@%s: no data (%s)", category, location, onc._describe(errors, settings))
        return {}
    if status == 401 or 128 in error_codes:
        code = "auth"
    elif status == 429:
        code = "rate_limited"
    elif status == 200:
        code = "bad_response"
    else:
        code = f"http_{status}"
    log.warning("ONC %s@%s failed: %s (%s)", category, location, code, onc._describe(errors, settings))
    raise UpstreamError(code)


def _column(series: Series, readings: Readings, axis: Axis) -> list[Any]:
    """The series on the axis: one value per step, None for a gap."""
    samples = readings.get(series.code) or []
    by_step: dict[int, list[tuple[datetime, float]]] = {}
    for sample in samples:
        i = axis.index(sample.time)  # a resampled time is the middle of its step
        value = _value(series, sample)
        if i is not None and value is not None:
            by_step.setdefault(i, []).append((sample.time, value))

    if series.aggregate == "vector":
        weights = _weights(readings.get(series.weight) if series.weight else None)
        values = {i: _vector_mean(pts, weights) for i, pts in by_step.items()}
    elif series.aggregate == "mean":
        values = {i: sum(v for _, v in pts) / len(pts) for i, pts in by_step.items()}
    elif series.aggregate == "max":
        values = {i: max(v for _, v in pts) for i, pts in by_step.items()}
    else:  # "avg" (one resampled value per step) and "newest"
        values = {i: max(pts)[1] for i, pts in by_step.items()}

    out: list[Any] = [None] * axis.n
    for i, value in values.items():
        v = rnd(value, series.digits)
        out[i] = v % 360 if v is not None and series.key.endswith("Deg") else v
    return out


def _value(series: Series, sample: onc.Sample) -> float | None:
    value = sample.value
    if not onc._is_number(value):
        return None
    if series.unit is None:
        return float(value)
    return onc._convert(series.key, float(value), sample.unit, series.unit)


def _weights(samples: Iterable[onc.Sample] | None) -> dict[datetime, float] | None:
    if samples is None:
        return None
    return {s.time: float(s.value) for s in samples if onc._is_number(s.value)}


def _vector_mean(points: list[tuple[datetime, float]], weights: dict[datetime, float] | None) -> float | None:
    """Direction (degrees) of the mean of unit vectors, each scaled by its weight sample (same
    time). When every weight is 0 the plain mean of the unit vectors is used: on 2026-08-17 the
    IONA anemometer read 0.0 m/s in 98% of samples while its vane kept turning. None when the
    vectors cancel out."""
    if weights is not None:
        weighted = [(weights[t], deg) for t, deg in points if t in weights]
        if any(w > 0 for w, _ in weighted):
            return _direction(weighted)
    return _direction([(1.0, deg) for _, deg in points])


def _direction(vectors: list[tuple[float, float]]) -> float | None:
    east = sum(w * math.sin(math.radians(deg)) for w, deg in vectors)
    north = sum(w * math.cos(math.radians(deg)) for w, deg in vectors)
    if math.hypot(east, north) < 1e-9:
        return None
    return math.degrees(math.atan2(east, north)) % 360
