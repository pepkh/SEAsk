"""Shared HTTP client for upstream APIs. Started and stopped by the FastAPI lifespan in main.py."""

import logging
from typing import Any

import httpx

# httpx logs every request URL at INFO. Some URLs carry an API key in the query string.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

_client: httpx.AsyncClient | None = None


class UpstreamError(Exception):
    """An upstream call failed. `code` is short and safe to show: no URLs, no keys."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def start_client(timeout_s: float) -> None:
    global _client
    _client = httpx.AsyncClient(
        timeout=timeout_s,
        headers={"User-Agent": "SEAsk/0.1 (+https://github.com/pepkh/SEAsk)"},
    )


async def stop_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client is not started. It is created in the app lifespan.")
    return _client


async def get_json(url: str, params: dict[str, Any], timeout_s: float | None = None) -> tuple[int, Any]:
    """GET `url` and return `(status, parsed JSON or None)`.

    `timeout_s` overrides HTTP_TIMEOUT_S for slow calls (whole-day reads); None keeps the default.
    Raises `UpstreamError("timeout" | "network")` when no response arrives. The httpx
    exception is dropped (`from None`) because its message and request hold the full URL.
    """
    response = await _get(url, params, timeout_s)
    try:
        body = response.json()
    except ValueError:
        body = None
    return response.status_code, body


async def get_text(url: str, params: dict[str, Any], timeout_s: float | None = None) -> tuple[int, str]:
    """GET `url` and return `(status, body text)`. Errors as in `get_json`."""
    response = await _get(url, params, timeout_s)
    return response.status_code, response.text


async def get_bytes(url: str, params: dict[str, Any] | None, timeout_s: float | None = None) -> tuple[int, bytes]:
    """GET `url` and return `(status, body bytes)` (binary formats). Errors as in `get_json`.

    `params=None` sends the URL's own query string untouched (e.g. ERDDAP's `var[a:b][c]` queries,
    which are not key=value pairs: httpx would rewrite them when merging params)."""
    response = await _get(url, params, timeout_s)
    return response.status_code, response.content


async def _get(url: str, params: dict[str, Any] | None, timeout_s: float | None) -> httpx.Response:
    # Only pass `timeout` when set: `timeout=None` in httpx means no timeout at all.
    extra = {"timeout": timeout_s} if timeout_s is not None else {}
    try:
        return await client().get(url, params=params, **extra)
    except httpx.TimeoutException:
        raise UpstreamError("timeout") from None
    except httpx.HTTPError:
        raise UpstreamError("network") from None


def redact(text: str, *secrets: str) -> str:
    """`text` with every non-empty secret replaced by `***`."""
    for secret in secrets:
        if secret:
            text = text.replace(secret, "***")
    return text
