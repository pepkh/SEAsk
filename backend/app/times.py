"""Timestamp helpers. API timestamps are ISO 8601; UTC ones end in `Z`."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/Vancouver")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(dt: datetime, timespec: str = "seconds") -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec=timespec).replace("+00:00", "Z")


def iso_local(dt: datetime, timespec: str = "seconds") -> str:
    """ISO time in America/Vancouver with its offset, e.g. `2026-10-17T13:00:00-07:00`."""
    return dt.astimezone(LOCAL_TZ).isoformat(timespec=timespec)


def parse_iso(value: object) -> datetime | None:
    """Parse an ISO timestamp (`Z` or offset; naive means UTC). None when unparseable."""
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
