"""Minimal async client for the Jetlog REST API."""

from __future__ import annotations

from datetime import date
from typing import Any

import aiohttp


class JetlogError(Exception):
    """Jetlog could not be reached or returned an error."""


class JetlogAuthError(JetlogError):
    """The API key was rejected."""


class JetlogClient:
    """Talks to jetlog with an API key (Settings -> API keys in jetlog)."""

    def __init__(self, session: aiohttp.ClientSession, url: str, api_key: str) -> None:
        self._session = session
        self._base = url.rstrip("/") + "/api"
        self._headers = {"Authorization": f"Bearer {api_key}"}

    async def _request(self, method: str, path: str, *, params: dict | None = None,
                       timeout: int = 30) -> Any:
        try:
            async with self._session.request(
                method, self._base + path, params=params, headers=self._headers,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as resp:
                if resp.status in (401, 403):
                    raise JetlogAuthError(f"{method} {path}: HTTP {resp.status}")
                if resp.status >= 400:
                    raise JetlogError(f"{method} {path}: HTTP {resp.status} {(await resp.text())[:200]}")
                return await resp.json()
        except (aiohttp.ClientError, TimeoutError) as err:
            raise JetlogError(f"{method} {path}: {err}") from err

    async def flights(self) -> list[dict]:
        return await self._request("GET", "/flights", params={"limit": 100000, "order": "ASC"})

    async def statistics(self, end: date | None = None) -> dict:
        params = {"metric": "true"}
        if end:
            params["end"] = end.isoformat()
        return await self._request("GET", "/statistics", params=params)

    async def decorations(self) -> list:
        return await self._request("GET", "/geography/decorations")

    async def world(self) -> dict:
        return await self._request("GET", "/geography/world", params={"visited": "true"}, timeout=60)

    async def active_status(self, hours_behind: int, hours_ahead: int) -> list[dict]:
        # jetlog may call FR24 several times for this, so allow for its retries
        return await self._request("GET", "/flight-status/active",
                                   params={"hours_behind": hours_behind, "hours_ahead": hours_ahead},
                                   timeout=90)

    async def backfill_status(self, days: int) -> dict:
        return await self._request("POST", "/flight-status/backfill", params={"days": days}, timeout=180)

    async def delay_summary(self) -> dict:
        return await self._request("GET", "/flight-status/summary", params={"recent": 10})
