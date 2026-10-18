"""Last-known health of each upstream source, shown by `/api/status`.

Updated only on real upstream calls (cache hits do not count).
"""

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class SourceHealth:
    ok: bool | None = None  # None until the first call
    last_error: str | None = None
    last_success_at: datetime | None = None

    def success(self, warning: str | None = None) -> None:
        """Record a working call. `warning` keeps a short note, e.g. a partial failure."""
        self.ok = True
        self.last_error = warning
        self.last_success_at = datetime.now(timezone.utc)

    def failure(self, code: str) -> None:
        self.ok = False
        self.last_error = code


ONC = SourceHealth()
OPENWEATHER = SourceHealth()
OPENMETEO = SourceHealth()
DFO = SourceHealth()
# Bridge screen sources, kept apart so an observatory failure does not mark the ship feed (ONC) down.
ONC_STATIONS = SourceHealth()  # ONC observatories and the second ferry (/bridge/*/stations)
CODAR = SourceHealth()  # ONC Strait of Georgia CODAR surface currents (/api/bridge/currents)
OPENMETEO_FORECAST = SourceHealth()  # Open-Meteo weather grid (/bridge/*/weather, atmosphere and wide parts)
SALISHSEACAST = SourceHealth()  # SalishSeaCast model currents on UBC's ERDDAP (/bridge/*/ocean, ssc part)
ECCC = SourceHealth()  # Environment and Climate Change Canada wind observations (/bridge/*/windobs)
