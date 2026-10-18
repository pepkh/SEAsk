"""Small in-memory async TTL cache.

- One fetch per key at a time (a per-key `asyncio.Lock`): concurrent callers wait for it.
- Failures (`UpstreamError`) are cached for `ERROR_TTL_S` (or `error_ttl_s`) so a broken upstream is
  not hammered.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable
from typing import Any

from app.http import UpstreamError

ERROR_TTL_S = 60.0


class TTLCache:
    def __init__(self, max_entries: int = 1024):
        # key -> (expires_at on the monotonic clock, value, error code or None)
        self._entries: dict[Hashable, tuple[float, Any, str | None]] = {}
        self._locks: dict[Hashable, asyncio.Lock] = {}
        self._max_entries = max_entries

    async def get(
        self, key: Hashable, ttl_s: float, fetch: Callable[[], Awaitable[Any]], error_ttl_s: float = ERROR_TTL_S
    ) -> Any:
        """The cached value for `key`, calling `fetch()` when it is missing or expired."""
        entry = self._fresh(key)
        if entry is None:
            async with self._locks.setdefault(key, asyncio.Lock()):
                entry = self._fresh(key)
                if entry is None:
                    try:
                        value = await fetch()
                    except UpstreamError as exc:
                        entry = self._store(key, error_ttl_s, None, exc.code)
                    else:
                        entry = self._store(key, ttl_s, value, None)
        _, value, error = entry
        if error is not None:
            raise UpstreamError(error)
        return value

    def _fresh(self, key: Hashable) -> tuple[float, Any, str | None] | None:
        entry = self._entries.get(key)
        if entry is not None and entry[0] > time.monotonic():
            return entry
        return None

    def _store(self, key: Hashable, ttl_s: float, value: Any, error: str | None):
        if len(self._entries) >= self._max_entries:
            self._prune()
        entry = (time.monotonic() + ttl_s, value, error)
        self._entries[key] = entry
        return entry

    def _prune(self) -> None:
        """Drop expired entries, then the soonest-expiring ones if still full."""
        now = time.monotonic()
        keep = sorted(
            ((k, e) for k, e in self._entries.items() if e[0] > now), key=lambda item: item[1][0]
        )[-(self._max_entries // 2) :]
        self._entries = dict(keep)
        self._locks = {
            k: lock for k, lock in self._locks.items() if k in self._entries or lock.locked()
        }

    def expire_within(self, key: Hashable, ttl_s: float) -> None:
        """Shorten a cached entry's life to at most `ttl_s` (e.g. a partial result worth retrying soon)."""
        entry = self._entries.get(key)
        if entry is not None:
            self._entries[key] = (min(entry[0], time.monotonic() + ttl_s), entry[1], entry[2])
