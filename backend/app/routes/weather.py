import asyncio
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.http import UpstreamError
from app.sources import openmeteo, owm

router = APIRouter(prefix="/api", tags=["live"])

# Salish Sea box. Requests outside it get a 422.
LAT_MIN, LAT_MAX = 47.5, 50.5
LON_MIN, LON_MAX = -125.5, -121.5

Part = Literal["live", "unavailable"]


class Parts(BaseModel):
    weather: Part = Field(description="OpenWeatherMap: temperature, condition, wind, visibility, sunset.")
    waves: Part = Field(description="Open-Meteo Marine: waves and sea temperature.")


class At(BaseModel):
    lat: float = Field(description="Grid-snapped latitude used for the lookup.", examples=[48.86])
    lon: float = Field(description="Grid-snapped longitude used for the lookup.", examples=[-123.30])


class Condition(BaseModel):
    id: int = Field(description="OpenWeatherMap condition id.", examples=[802])
    icon: str | None = Field(description="OpenWeatherMap icon code.", examples=["03d"])


class Wind(BaseModel):
    kn: float = Field(description="Wind speed, knots.", examples=[11.7])
    fromDeg: int | None = Field(description="Direction the wind blows from, degrees.", examples=[310])
    gustKn: float | None = Field(description="Gust speed, knots.", examples=[17.5])


class Waves(BaseModel):
    m: float = Field(description="Significant wave height, m.", examples=[0.18])
    swellM: float | None = Field(description="Swell wave height, m.", examples=[0.06])
    periodS: float | None = Field(description="Wave period, s.", examples=[1.9])


class WeatherNow(BaseModel):
    """Fields from an unavailable part are null."""

    parts: Parts
    observedAt: str | None = Field(
        description="OpenWeatherMap observation time, else the Open-Meteo time. UTC.",
        examples=["2026-10-17T20:00:00Z"],
    )
    at: At
    tempC: float | None = Field(description="Air temperature, °C.", examples=[10.6])
    feelsLikeC: float | None = Field(description="Feels-like temperature, °C.", examples=[9.4])
    condition: Condition | None
    wind: Wind | None
    waves: Waves | None
    seaTempC: float | None = Field(description="Sea surface temperature, °C.", examples=[11.2])
    visibilityKm: float | None = Field(
        description="Visibility, km (OpenWeatherMap caps it at 10).", examples=[10]
    )
    sunset: str | None = Field(description="Local sunset time, HH:MM.", examples=["18:22"])


def snap(value: float, step: float) -> float:
    """`value` rounded to the nearest multiple of `step` (the cache grid)."""
    return round(round(value / step) * step, 4) if step > 0 else value


async def _weather_part(settings: Settings, lat: float, lon: float) -> dict[str, Any] | None:
    if not settings.openweather_api_key:
        return None
    try:
        return await owm.current(settings, lat, lon)
    except UpstreamError:
        return None


async def _waves_part(settings: Settings, lat: float, lon: float) -> dict[str, Any] | None:
    try:
        return await openmeteo.current(settings, lat, lon)
    except UpstreamError:
        return None


@router.get(
    "/weather",
    response_model=WeatherNow,
    summary="Current weather and waves at a point",
    responses={
        422: {"description": "lat/lon missing or outside the Salish Sea box."},
        503: {"description": "`weather_unavailable`: both parts failed."},
    },
)
async def weather(
    lat: float = Query(ge=LAT_MIN, le=LAT_MAX, description="Latitude, 47.5 to 50.5.", examples=[48.689]),
    lon: float = Query(ge=LON_MIN, le=LON_MAX, description="Longitude, -125.5 to -121.5.", examples=[-123.4]),
):
    """Weather from OpenWeatherMap and waves from Open-Meteo Marine. Each part is cached
    (WEATHER_CACHE_S, MARINE_CACHE_S) per WEATHER_GRID_DEG grid cell, and either may be
    `unavailable` (OpenWeatherMap needs OPENWEATHER_API_KEY)."""
    settings = get_settings()
    lat, lon = snap(lat, settings.weather_grid_deg), snap(lon, settings.weather_grid_deg)
    wx, sea = await asyncio.gather(
        _weather_part(settings, lat, lon), _waves_part(settings, lat, lon)
    )
    if wx is None and sea is None:
        raise HTTPException(status_code=503, detail="weather_unavailable")

    parts = {
        "weather": "unavailable" if wx is None else "live",
        "waves": "unavailable" if sea is None else "live",
    }
    wx, sea = wx or {}, sea or {}
    return {
        "parts": parts,
        "observedAt": wx.get("observedAt") or sea.get("observedAt"),
        "at": {"lat": lat, "lon": lon},
        "tempC": wx.get("tempC"),
        "feelsLikeC": wx.get("feelsLikeC"),
        "condition": wx.get("condition"),
        "wind": wx.get("wind"),
        "waves": sea.get("waves"),
        "seaTempC": sea.get("seaTempC"),
        "visibilityKm": wx.get("visibilityKm"),
        "sunset": wx.get("sunset"),
    }
