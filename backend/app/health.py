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
