"""Current weather from OpenWeatherMap (`/data/2.5/weather`, metric units).

The API key travels in the query string, so URLs are never logged.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.http import UpstreamError, get_json
from app.times import iso_utc

log = logging.getLogger(__name__)

URL = "https://api.openweathermap.org/data/2.5/weather"
MS_TO_KN = 1.943844

_cache = TTLCache()


async def current(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    """Weather fields for the `/api/weather` body, cached for WEATHER_CACHE_S.

    Raises `UpstreamError`. The caller checks that OPENWEATHER_API_KEY is set first.
    """
    return await _cache.get((lat, lon), settings.weather_cache_s, lambda: _fetch(settings, lat, lon))


async def _fetch(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    try:
        status, body = await get_json(
            URL, {"lat": lat, "lon": lon, "appid": settings.openweather_api_key, "units": "metric"}
        )
        if status != 200:
            raise UpstreamError({401: "auth", 429: "rate_limited"}.get(status, f"http_{status}"))
        result = _parse(body)
    except UpstreamError as exc:
        log.warning("OpenWeatherMap failed: %s", exc.code)
        health.OPENWEATHER.failure(exc.code)
        raise
    health.OPENWEATHER.success()
    return result


def _parse(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict) or not isinstance(body.get("main"), dict):
        raise UpstreamError("bad_response")
    main = body["main"]
    wind = body.get("wind") if isinstance(body.get("wind"), dict) else {}
    weather = (body.get("weather") or [None])[0]
    sun = body.get("sys") if isinstance(body.get("sys"), dict) else {}

    observed = body.get("dt")
    return {
        "observedAt": iso_utc(datetime.fromtimestamp(observed, timezone.utc)) if _num(observed) else None,
        "tempC": _round(main.get("temp"), 1),
        "feelsLikeC": _round(main.get("feels_like"), 1),
        "condition": (
            {"id": weather.get("id"), "icon": weather.get("icon")}
            if isinstance(weather, dict) and weather.get("id") is not None
            else None
        ),
        "wind": (
            {
                "kn": _round(wind["speed"] * MS_TO_KN, 1),
                "fromDeg": round(wind["deg"]) if _num(wind.get("deg")) else None,
                "gustKn": _round(wind["gust"] * MS_TO_KN, 1) if _num(wind.get("gust")) else None,
            }
            if _num(wind.get("speed"))
            else None
        ),
        "visibilityKm": _round(body["visibility"] / 1000, 1) if _num(body.get("visibility")) else None,
        "sunset": _local_hhmm(sun.get("sunset"), body.get("timezone")),
    }


def _local_hhmm(unix_utc: Any, offset_s: Any) -> str | None:
    """`HH:MM` at the location, from a UTC unix time and OWM's `timezone` offset in seconds."""
    if not _num(unix_utc):
        return None
    offset = timedelta(seconds=offset_s if _num(offset_s) else 0)
    return datetime.fromtimestamp(unix_utc, timezone(offset)).strftime("%H:%M")


def _num(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _round(value: Any, digits: int) -> float | None:
    return round(float(value), digits) if _num(value) else None
