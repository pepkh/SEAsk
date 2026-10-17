"""Current waves and sea temperature from the Open-Meteo Marine API (no key needed)."""

import logging
from typing import Any

from app import health
from app.cache import TTLCache
from app.config import Settings
from app.http import UpstreamError, get_json
from app.times import iso_utc, parse_iso

log = logging.getLogger(__name__)

URL = "https://marine-api.open-meteo.com/v1/marine"
CURRENT = "wave_height,swell_wave_height,wave_period,sea_surface_temperature"

_cache = TTLCache()


async def current(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    """Wave fields for the `/api/weather` body, cached for MARINE_CACHE_S.

    Near the shore the model cell can have no waves; then the fallback point
    (MARINE_FALLBACK_LAT/LON, mid Strait of Georgia) is used. Raises `UpstreamError`.
    """
    result = await _cached(settings, lat, lon)
    fallback = (settings.marine_fallback_lat, settings.marine_fallback_lon)
    if result["waves"] is None and (lat, lon) != fallback:
        result = await _cached(settings, *fallback)
    if result["waves"] is None:
        raise UpstreamError("no_data")
    return result


async def _cached(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    return await _cache.get((lat, lon), settings.marine_cache_s, lambda: _fetch(lat, lon))


async def _fetch(lat: float, lon: float) -> dict[str, Any]:
    try:
        status, body = await get_json(
            URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current": CURRENT,
                "cell_selection": "sea",
                "timezone": "GMT",
            },
        )
        if status != 200:
            raise UpstreamError({429: "rate_limited"}.get(status, f"http_{status}"))
        result = _parse(body)
    except UpstreamError as exc:
        log.warning("Open-Meteo Marine failed: %s", exc.code)
        health.OPENMETEO.failure(exc.code)
        raise
    health.OPENMETEO.success()
    return result


def _parse(body: Any) -> dict[str, Any]:
    current = body.get("current") if isinstance(body, dict) else None
    if not isinstance(current, dict):
        raise UpstreamError("bad_response")
    observed = parse_iso(current.get("time"))  # GMT, no offset in the string
    wave = _num(current.get("wave_height"))
    return {
        "observedAt": iso_utc(observed) if observed else None,
        "waves": (
            {
                "m": wave,
                "swellM": _num(current.get("swell_wave_height")),
                "periodS": _num(current.get("wave_period")),
            }
            if wave is not None
            else None
        ),
        "seaTempC": _num(current.get("sea_surface_temperature")),
    }


def _num(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
