from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import health
from app.config import get_settings
from app.times import iso_utc

router = APIRouter(prefix="/api", tags=["live"])


class SourceStatus(BaseModel):
    configured: bool = Field(description="Whether the source has the settings it needs (e.g. an API key).")
    ok: bool | None = Field(description="Result of the last upstream call; null before the first call.")
    last_error: str | None = Field(
        description="Short code such as `auth`, `timeout`, `http_502`, `stale` or `partial:TSG`.",
        examples=["timeout"],
    )
    last_success_at: str | None = Field(description="Time of the last working call, UTC.")


class Status(BaseModel):
    onc: SourceStatus = Field(description="Ocean Networks Canada ship data (`/api/ship/latest`, `/api/ship/history`).")
    openweathermap: SourceStatus = Field(description="OpenWeatherMap (`/api/weather`, weather part).")
    openmeteo: SourceStatus = Field(
        description="Open-Meteo Marine (`/api/weather` waves part, `marine` part of the bridge weather, "
        "`global` part of the bridge ocean)."
    )
    dfo: SourceStatus = Field(description="DFO IWLS tide and current predictions (`/api/tides`, bridge tides).")
    onc_observatories: SourceStatus = Field(
        description="ONC observatories SCVIP, SEVIP, IONA and the second ferry TWDP (bridge `stations`). "
        "Kept apart from `onc` so they never mark the ship feed down."
    )
    codar: SourceStatus = Field(description="ONC Strait of Georgia CODAR surface currents (`/api/bridge/currents`).")
    openmeteo_forecast: SourceStatus = Field(
        description="Open-Meteo weather grid: forecast and historical forecast (bridge `weather`, atmosphere "
        "and wide parts)."
    )
    salishseacast: SourceStatus = Field(
        description="SalishSeaCast model currents from UBC's ERDDAP (bridge `ocean`, ssc part)."
    )
    eccc: SourceStatus = Field(
        description="Environment and Climate Change Canada wind observations: climate-hourly (replay) and "
        "SWOB real-time (live) (bridge `windobs`)."
    )


def source_status(configured: bool, state: health.SourceHealth) -> dict:
    return {
        "configured": configured,
        "ok": state.ok,
        "last_error": state.last_error,
        "last_success_at": iso_utc(state.last_success_at) if state.last_success_at else None,
    }


@router.get("/status", response_model=Status, summary="Health of the live data sources")
def status():
    """Last-known state of each upstream source. Never includes keys or URLs."""
    settings = get_settings()
    return {
        "onc": source_status(bool(settings.onc_token), health.ONC),
        "openweathermap": source_status(bool(settings.openweather_api_key), health.OPENWEATHER),
        "openmeteo": source_status(True, health.OPENMETEO),
        "dfo": source_status(True, health.DFO),
        "onc_observatories": source_status(bool(settings.onc_token), health.ONC_STATIONS),
        "codar": source_status(bool(settings.onc_token), health.CODAR),
        "openmeteo_forecast": source_status(True, health.OPENMETEO_FORECAST),
        "salishseacast": source_status(True, health.SALISHSEACAST),
        "eccc": source_status(True, health.ECCC),
    }
