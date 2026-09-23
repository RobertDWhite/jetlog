"""Data coordinator for Jetlog."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
import hashlib
import logging
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import JetlogAuthError, JetlogClient, JetlogError
from .const import (
    BACKFILL_DAYS,
    CONF_MAP_EXTENT,
    DOMAIN,
    MAP_EXTENT_AUTO,
    SLOW_REFRESH_INTERVAL,
    STATUS_HOURS_AHEAD,
    STATUS_HOURS_BEHIND,
    UPCOMING_DAYS,
    UPDATE_INTERVAL,
)
from .map import render_map

_LOGGER = logging.getLogger(__name__)

type JetlogConfigEntry = ConfigEntry[JetlogCoordinator]


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name) if name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _parse(value: str | None) -> datetime | None:
    return dt_util.parse_datetime(value) if value else None


@dataclass
class Flight:
    """One leg, with times resolved to aware datetimes."""

    raw: dict
    departure: datetime            # scheduled, per jetlog
    arrival: datetime              # scheduled, per jetlog (estimated when jetlog has no arrival time)
    has_times: bool
    status: dict | None = None     # jetlog /flight-status payload, when known

    @property
    def id(self) -> int:
        return self.raw["id"]

    @property
    def origin(self) -> dict:
        return self.raw["origin"]

    @property
    def destination(self) -> dict:
        return self.raw["destination"]

    @property
    def route(self) -> str:
        return f"{self.origin.get('iata') or self.origin['icao']} → {self.destination.get('iata') or self.destination['icao']}"

    @property
    def title(self) -> str:
        return f"{self.raw.get('flightNumber') or 'Flight'} {self.route}"

    def _status_time(self, key: str) -> datetime | None:
        return _parse(self.status.get(key)) if self.status else None

    @property
    def best_departure(self) -> datetime:
        return (self._status_time("actual_departure") or self._status_time("estimated_departure")
                or self.departure)

    @property
    def best_arrival(self) -> datetime:
        return (self._status_time("actual_arrival") or self._status_time("estimated_arrival")
                or self.arrival)

    @property
    def in_air(self) -> bool:
        if self.status:
            if self.status.get("live"):
                return True
            if self.status.get("final"):
                return False
            if self.status.get("actual_departure") and not self.status.get("actual_arrival"):
                return True
        return self.has_times and self.best_departure <= dt_util.utcnow() < self.best_arrival

    def attributes(self) -> dict[str, Any]:
        """Flight details safe to expose (no notes: they hold confirmation/ticket numbers)."""
        r = self.raw
        airline = r.get("airline") or {}
        attrs: dict[str, Any] = {
            "flight_id": r["id"],
            "flight_number": r.get("flightNumber"),
            "airline": airline.get("name"),
            "route": self.route,
            "origin": self.origin.get("iata") or self.origin["icao"],
            "origin_name": self.origin.get("name"),
            "origin_city": self.origin.get("municipality"),
            "destination": self.destination.get("iata") or self.destination["icao"],
            "destination_name": self.destination.get("name"),
            "destination_city": self.destination.get("municipality"),
            "date": r.get("date"),
            "departure_time": r.get("departureTime"),
            "arrival_time": r.get("arrivalTime"),
            "scheduled_departure": self.departure.isoformat() if self.has_times else None,
            "scheduled_arrival": self.arrival.isoformat() if self.has_times else None,
            "duration_min": r.get("duration"),
            "distance_km": r.get("distance"),
            "aircraft": r.get("airplane"),
            "tail_number": r.get("tailNumber"),
            "seat": r.get("seat"),
            "seat_number": r.get("seatNumber"),
            "ticket_class": r.get("ticketClass"),
            "purpose": r.get("purpose"),
        }
        if self.status:
            s = self.status
            attrs.update({
                "status": s.get("status"),
                "status_text": s.get("status_text"),
                "in_air": self.in_air,
                "estimated_departure": s.get("estimated_departure"),
                "estimated_arrival": s.get("estimated_arrival"),
                "actual_departure": s.get("actual_departure"),
                "actual_arrival": s.get("actual_arrival"),
                "departure_delay_min": s.get("departure_delay"),
                "arrival_delay_min": s.get("arrival_delay"),
                "registration": s.get("registration"),
                "status_updated": s.get("updated_at"),
            })
        return attrs


def _build_flight(raw: dict) -> Flight:
    origin_tz = _tz(raw["origin"].get("timezone"))
    dest_tz = _tz(raw["destination"].get("timezone"))
    day = date.fromisoformat(raw["date"])
    has_times = bool(raw.get("departureTime"))

    dep_clock = datetime.strptime(raw["departureTime"], "%H:%M").time() if has_times else datetime.min.time()
    departure = datetime.combine(day, dep_clock, origin_tz)

    if raw.get("arrivalTime"):
        arr_day = date.fromisoformat(raw["arrivalDate"]) if raw.get("arrivalDate") else day
        arrival = datetime.combine(arr_day, datetime.strptime(raw["arrivalTime"], "%H:%M").time(), dest_tz)
        if arrival <= departure:
            arrival += timedelta(days=1)
    else:
        arrival = departure + timedelta(minutes=raw.get("duration") or 180)

    return Flight(raw=raw, departure=departure, arrival=arrival, has_times=has_times)


@dataclass
class JetlogData:
    """Everything the entities read."""

    flights: list[Flight] = field(default_factory=list)
    statistics: dict = field(default_factory=dict)
    delay_summary: dict = field(default_factory=dict)
    map_svg: bytes | None = None
    map_updated: datetime | None = None

    @property
    def current_or_next(self) -> Flight | None:
        now = dt_util.utcnow()
        return next((f for f in self.flights if f.best_arrival > now), None)

    @property
    def upcoming(self) -> list[Flight]:
        now = dt_util.utcnow()
        return [f for f in self.flights if f.best_departure > now]

    @property
    def last_completed(self) -> Flight | None:
        now = dt_util.utcnow()
        return next((f for f in reversed(self.flights) if f.best_arrival <= now), None)

    @property
    def in_air(self) -> Flight | None:
        return next((f for f in self.flights if f.in_air), None)

    def flown_between(self, start: date, end: date) -> list[Flight]:
        now = dt_util.utcnow()
        return [f for f in self.flights if start <= f.departure.date() <= end and f.best_arrival <= now]


class JetlogCoordinator(DataUpdateCoordinator[JetlogData]):
    """Polls live status every few minutes and the heavier endpoints hourly."""

    config_entry: JetlogConfigEntry

    def __init__(self, hass: HomeAssistant, entry: JetlogConfigEntry, client: JetlogClient) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=UPDATE_INTERVAL)
        self.client = client
        self._raw_flights: list[dict] = []
        self._statistics: dict = {}
        self._delay_summary: dict = {}
        self._decorations: list = []
        self._world: dict | None = None
        self._slow_refreshed: datetime | None = None
        self._map_svg: bytes | None = None
        self._map_hash: str | None = None
        self._map_updated: datetime | None = None

    def force_full_refresh(self) -> None:
        self._slow_refreshed = None

    async def _slow_refresh(self) -> None:
        # Record delays for recently landed flights before reading the summary.
        try:
            await self.client.backfill_status(BACKFILL_DAYS)
        except JetlogError as err:
            _LOGGER.debug("Delay backfill failed: %s", err)

        tomorrow = dt_util.now().date() + timedelta(days=1)
        self._raw_flights = await self.client.flights()
        self._statistics = await self.client.statistics(end=tomorrow)
        self._delay_summary = await self.client.delay_summary()
        self._decorations = await self.client.decorations()
        if self._world is None:
            self._world = await self.client.world()
        self._slow_refreshed = dt_util.utcnow()

    def _render_map(self, flights: list[Flight]) -> None:
        now = dt_util.utcnow()
        upcoming = [f.raw for f in flights if now < f.best_arrival <= now + timedelta(days=UPCOMING_DAYS)]
        svg = render_map(
            world=self._world or {},
            decorations=self._decorations,
            upcoming=upcoming,
            statistics=self._statistics,
            extent=self.config_entry.options.get(CONF_MAP_EXTENT, MAP_EXTENT_AUTO),
        ).encode()
        digest = hashlib.sha256(svg).hexdigest()
        if digest != self._map_hash:
            self._map_svg, self._map_hash, self._map_updated = svg, digest, now

    async def _async_update_data(self) -> JetlogData:
        try:
            if self._slow_refreshed is None or dt_util.utcnow() - self._slow_refreshed >= SLOW_REFRESH_INTERVAL:
                await self._slow_refresh()
            active = await self.client.active_status(STATUS_HOURS_BEHIND, STATUS_HOURS_AHEAD)
        except JetlogAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except JetlogError as err:
            raise UpdateFailed(str(err)) from err

        statuses = {a["flight_id"]: a["status"] for a in active}
        flights = []
        for raw in self._raw_flights:
            try:
                flight = _build_flight(raw)
            except (KeyError, ValueError) as err:
                _LOGGER.debug("Skipping flight %s: %s", raw.get("id"), err)
                continue
            flight.status = statuses.get(flight.id) or (self.data and self._previous_status(flight.id))
            flights.append(flight)
        flights.sort(key=lambda f: f.departure)

        self._render_map(flights)
        return JetlogData(
            flights=flights,
            statistics=self._statistics,
            delay_summary=self._delay_summary,
            map_svg=self._map_svg,
            map_updated=self._map_updated,
        )

    def _previous_status(self, flight_id: int) -> dict | None:
        """Keep a landed flight's status after it drops out of the active window."""
        previous = next((f for f in self.data.flights if f.id == flight_id), None)
        return previous.status if previous and previous.status and previous.status.get("final") else None
