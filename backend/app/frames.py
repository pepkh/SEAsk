"""Building blocks of the bridge payloads (`/bridge/{date}/*` and `/api/bridge/*`).

Every dataset is column-oriented on a regular time axis: `t0` (ISO UTC), `stepS` and `n`, and each
column is a dense list of length `n` with `null` for a missing value. The kiosk loads a whole day
once and scrubs through it locally, so the payloads are built once and served as JSON bytes.
"""

import json
import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import Response

from app.times import LOCAL_TZ, iso_utc


@dataclass(frozen=True)
class Axis:
    """A regular time axis: frame `i` is at `t0 + i * step_s`."""

    t0: datetime
    step_s: int
    n: int

    def index(self, dt: datetime) -> int | None:
        """The frame that contains `dt` (floor), or None outside the axis."""
        i = math.floor((dt - self.t0).total_seconds() / self.step_s)
        return i if 0 <= i < self.n else None

    def nearest(self, dt: datetime) -> int | None:
        """The frame nearest to `dt`, or None more than half a step outside the axis."""
        i = round((dt - self.t0).total_seconds() / self.step_s)
        return i if 0 <= i < self.n else None

    def time(self, i: int) -> datetime:
        return self.t0 + timedelta(seconds=i * self.step_s)

    def header(self) -> dict[str, Any]:
        return {"t0": iso_utc(self.t0), "stepS": self.step_s, "n": self.n}


def day_bounds(d: date) -> tuple[datetime, datetime]:
    """Local (America/Vancouver) midnight to the next local midnight, in UTC."""
    start = datetime.combine(d, time(), LOCAL_TZ)
    end = datetime.combine(d + timedelta(days=1), time(), LOCAL_TZ)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def day_axis(d: date, step_s: int, include_end: bool = False) -> Axis:
    """The local day at `step_s`. `include_end` adds the frame at the next midnight (tides, hours)."""
    start, end = day_bounds(d)
    n = int((end - start).total_seconds() // step_s) + (1 if include_end else 0)
    return Axis(start, step_s, n)


def dense(axis: Axis, points: Iterable[tuple[datetime, float | None]], digits: int) -> list[float | None]:
    """Values placed on the axis at their nearest frame; later points win; gaps are None."""
    out: list[float | None] = [None] * axis.n
    for t, v in points:
        i = axis.nearest(t)
        if i is not None and v is not None:
            out[i] = rnd(v, digits)
    return out


def rnd(value: Any, digits: int) -> float | int | None:
    """`value` rounded (an int for 0 digits); None for missing, NaN or infinite values."""
    if value is None or isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v):
        return None
    return int(round(v)) if digits == 0 else round(v, digits)


def to_bytes(payload: dict[str, Any]) -> bytes:
    """Compact JSON. `allow_nan=False` so a stray NaN fails here, not in the browser."""
    return json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()


def json_response(body: bytes, max_age_s: int) -> Response:
    return Response(
        content=body,
        media_type="application/json",
        headers={"Cache-Control": f"public, max-age={max_age_s}"},
    )
