"""Cache for whole days of the bridge datasets read from upstream APIs (tides, weather, stations).

A finished past day never changes, so its payload is built once and kept:
1. in memory for BRIDGE_PAST_CACHE_S;
2. in the Neon table `bridge_cache`, so a restart does not refetch it from ONC, Open-Meteo and DFO.

Only complete payloads of finished days are kept that way (every part "ok", and the local day has
ended). Anything else (a part failed, or today and tomorrow) is cached in memory for `open_ttl_s`
only, so it is retried soon. Without NEON_URL, or when Neon fails, the cache works in memory only.

The table is created on first use (`create table if not exists`); this module never touches any
other table. Bump FORMAT_VERSION when every payload shape changes, or the dataset's entry in
DATASET_VERSIONS when one does: rows of older versions are ignored.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import date

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.cache import TTLCache
from app.config import get_settings
from app.frames import day_bounds
from app.times import utc_now
from db import get_engine

log = logging.getLogger(__name__)

FORMAT_VERSION = 1
# Datasets whose shape changed since FORMAT_VERSION (weather: + `wide`).
DATASET_VERSIONS = {"weather": 2}
# After a Neon error, stay in memory-only mode this long before trying Neon again.
NEON_RETRY_S = 300
MEMORY_MAX_ENTRIES = 64

CREATE_TABLE = """
create table if not exists bridge_cache (
    dataset text not null,
    day date not null,
    version smallint not null,
    payload text not null,
    built_at timestamptz not null default now(),
    primary key (dataset, day, version)
)
"""

Key = tuple[str, date]
# Returns the payload bytes and whether it is complete (every part "ok").
Build = Callable[[], Awaitable[tuple[bytes, bool]]]

_done: dict[Key, tuple[float, bytes]] = {}  # complete finished days: (expires_at monotonic, payload)
_builds = TTLCache(max_entries=MEMORY_MAX_ENTRIES)  # one build per key at a time; short-lived results
_table_ready = False
_neon_off_until = 0.0  # monotonic time; float("inf") without NEON_URL


def finished(d: date) -> bool:
    """Whether the local day `d` has ended."""
    return day_bounds(d)[1] <= utc_now()


async def get(dataset: str, d: date, build: Build, open_ttl_s: float) -> tuple[bytes, bool]:
    """The payload of `dataset` for the local day `d`, from memory, Neon or `build()`, and whether
    it is final (complete, and the day has ended), i.e. will never change.

    `open_ttl_s`: how long a payload that is not final is kept in memory. `build()` raising
    `UpstreamError` is cached for a minute (see `TTLCache`).
    """
    key = (dataset, d)
    hit = _done.get(key)
    if hit is not None and hit[0] > time.monotonic():
        return hit[1], True
    return await _builds.get(key, open_ttl_s, lambda: _load_or_build(key, build))


async def _load_or_build(key: Key, build: Build) -> tuple[bytes, bool]:
    dataset, d = key
    done = finished(d)
    if done:
        stored = await _neon(_read, dataset, d)
        if stored is not None:
            _remember(key, stored)
            return stored, True
    body, complete = await build()
    final = done and complete
    if final:
        _remember(key, body)
        await _neon(_write, dataset, d, body)
    return body, final


def _remember(key: Key, body: bytes) -> None:
    now = time.monotonic()
    if len(_done) >= MEMORY_MAX_ENTRIES:
        for k in [k for k, (expires, _) in _done.items() if expires <= now]:
            del _done[k]
        while len(_done) >= MEMORY_MAX_ENTRIES:
            del _done[min(_done, key=lambda k: _done[k][0])]
    _done[key] = (now + get_settings().bridge_past_cache_s, body)


async def _neon(fn: Callable[..., bytes | None], *args) -> bytes | None:
    """Run a Neon read or write in a thread. Errors switch to memory-only mode instead of failing."""
    global _neon_off_until
    if time.monotonic() < _neon_off_until:
        return None
    try:
        return await asyncio.to_thread(fn, *args)
    except RuntimeError:  # NEON_URL is not set
        log.info("bridge_cache: NEON_URL is not set; caching past days in memory only")
        _neon_off_until = float("inf")
    except SQLAlchemyError as exc:
        log.warning("bridge_cache: Neon failed (%s); memory only for %d s", type(exc).__name__, NEON_RETRY_S)
        _neon_off_until = time.monotonic() + NEON_RETRY_S
    return None


def _version(dataset: str) -> int:
    return DATASET_VERSIONS.get(dataset, FORMAT_VERSION)


def _ensure_table() -> None:
    global _table_ready
    if not _table_ready:
        with get_engine().begin() as conn:
            conn.execute(text(CREATE_TABLE))
        _table_ready = True


def _read(dataset: str, d: date) -> bytes | None:
    _ensure_table()
    with get_engine().connect() as conn:
        payload = conn.execute(
            text(
                "select payload from bridge_cache "
                "where dataset = :dataset and day = :day and version = :version"
            ),
            {"dataset": dataset, "day": d, "version": _version(dataset)},
        ).scalar()
    return payload.encode() if payload is not None else None


def _write(dataset: str, d: date, body: bytes) -> None:
    _ensure_table()
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "insert into bridge_cache (dataset, day, version, payload) "
                "values (:dataset, :day, :version, :payload) "
                "on conflict (dataset, day, version) do update set payload = excluded.payload, built_at = now()"
            ),
            {"dataset": dataset, "day": d, "version": _version(dataset), "payload": body.decode()},
        )
    log.info("bridge_cache: stored %s %s (%d bytes)", dataset, d, len(body))
