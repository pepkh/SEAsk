"""Settings read from the environment and `backend/.env`. See `.env.example`."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# The open water around Vancouver Island that the bridge map can zoom out to (south, north, west,
# east): the `global` model currents and the `wide` wind of the bridge datasets cover it.
OCEAN_AREA = (47.0, 51.0, -129.5, -122.0)


def _str(name: str, default: str = "") -> str:
    """The variable's value, or `default` when it is unset or blank."""
    return os.environ.get(name, "").strip() or default


def _float(name: str, default: float) -> float:
    value = _str(name)
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        raise RuntimeError(f"{name} must be a number, got {value!r}") from None


def _list(name: str, default: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in _str(name, default).split(",") if item.strip())


def _floats(name: str, default: str, count: int) -> tuple[float, ...]:
    items = _list(name, default)
    try:
        values = tuple(float(item) for item in items)
    except ValueError:
        raise RuntimeError(f"{name} must be {count} comma-separated numbers") from None
    if len(values) != count:
        raise RuntimeError(f"{name} must be {count} comma-separated numbers, got {len(values)}")
    return values


@dataclass(frozen=True)
class Settings:
    # Ocean Networks Canada (Oceans 3.0 API)
    onc_token: str
    onc_base_url: str
    onc_location_code: str
    onc_nav_location_code: str
    onc_cache_s: float
    onc_nav_cache_s: float
    onc_history_cache_s: float
    onc_max_sensor_age_s: float
    onc_max_position_age_s: float
    magnetic_declination_deg: float
    # OpenWeatherMap
    openweather_api_key: str
    weather_cache_s: float
    weather_grid_deg: float
    # Open-Meteo Marine
    marine_cache_s: float
    marine_fallback_lat: float
    marine_fallback_lon: float
    # DFO Integrated Water Level System (tides and currents)
    dfo_base_url: str
    dfo_tide_stations: tuple[str, ...]
    dfo_current_station: str
    dfo_cache_s: float
    # Captain's bridge screen (/bridge and /api/bridge)
    bridge_bbox: tuple[float, float, float, float]  # south, north, west, east
    bridge_wx_grid_deg: float
    bridge_past_cache_s: float
    bridge_day_timeout_s: float
    bridge_live_cache_s: float
    onc_codar_location_code: str
    # Shared
    http_timeout_s: float
    cors_origins: tuple[str, ...]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        onc_token=_str("ONC_TOKEN"),
        onc_base_url=_str("ONC_BASE_URL", "https://data.oceannetworks.ca/api").rstrip("/"),
        onc_location_code=_str("ONC_LOCATION_CODE", "TWSB"),
        onc_nav_location_code=_str("ONC_NAV_LOCATION_CODE", "TWSB.N1"),
        onc_cache_s=_float("ONC_CACHE_S", 30),
        onc_nav_cache_s=_float("ONC_NAV_CACHE_S", 3),
        onc_history_cache_s=_float("ONC_HISTORY_CACHE_S", 20),
        onc_max_sensor_age_s=_float("ONC_MAX_SENSOR_AGE_S", 300),
        onc_max_position_age_s=_float("ONC_MAX_POSITION_AGE_S", 900),
        magnetic_declination_deg=_float("MAGNETIC_DECLINATION_DEG", 15.3),
        openweather_api_key=_str("OPENWEATHER_API_KEY"),
        weather_cache_s=_float("WEATHER_CACHE_S", 600),
        weather_grid_deg=_float("WEATHER_GRID_DEG", 0.02),
        marine_cache_s=_float("MARINE_CACHE_S", 900),
        marine_fallback_lat=_float("MARINE_FALLBACK_LAT", 48.95),
        marine_fallback_lon=_float("MARINE_FALLBACK_LON", -123.20),
        dfo_base_url=_str("DFO_BASE_URL", "https://api-iwls.dfo-mpo.gc.ca/api/v1").rstrip("/"),
        dfo_tide_stations=_list("DFO_TIDE_STATIONS", "07270,07528,07590"),
        dfo_current_station=_str("DFO_CURRENT_STATION", "07527"),
        dfo_cache_s=_float("DFO_CACHE_S", 6 * 3600),
        bridge_bbox=_floats("BRIDGE_BBOX", "48.55,49.35,-123.75,-122.85", 4),  # type: ignore[arg-type]
        bridge_wx_grid_deg=_float("BRIDGE_WX_GRID_DEG", 0.05),
        bridge_past_cache_s=_float("BRIDGE_PAST_CACHE_S", 7 * 24 * 3600),
        bridge_day_timeout_s=_float("BRIDGE_DAY_TIMEOUT_S", 90),
        bridge_live_cache_s=_float("BRIDGE_LIVE_CACHE_S", 300),
        onc_codar_location_code=_str("ONC_CODAR_LOCATION_CODE", "SOGCS"),
        http_timeout_s=_float("HTTP_TIMEOUT_S", 10),
        cors_origins=_list("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173"),
    )
