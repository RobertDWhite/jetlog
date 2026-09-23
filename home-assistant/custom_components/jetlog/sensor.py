"""Sensors for Jetlog."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import PERCENTAGE, UnitOfLength, UnitOfMass, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import UPCOMING_ATTRIBUTE_LIMIT
from .coordinator import Flight, JetlogConfigEntry, JetlogData
from .entity import JetlogEntity


def _status(flight: Flight | None, key: str) -> Any:
    return flight.status.get(key) if flight and flight.status else None


def _brief(flight: Flight) -> dict[str, Any]:
    a = flight.attributes()
    return {k: a.get(k) for k in ("flight_id", "date", "flight_number", "route", "departure_time",
                                  "arrival_time", "scheduled_departure", "aircraft", "seat_number",
                                  "ticket_class", "status_text", "departure_delay_min",
                                  "arrival_delay_min") if a.get(k) is not None}


def _year_flights(data: JetlogData) -> list[Flight]:
    today = dt_util.now().date()
    return data.flown_between(date(today.year, 1, 1), today)


@dataclass(frozen=True, kw_only=True)
class JetlogSensorDescription(SensorEntityDescription):
    value_fn: Callable[[JetlogData], Any]
    attrs_fn: Callable[[JetlogData], dict[str, Any] | None] = lambda _: None


SENSORS: tuple[JetlogSensorDescription, ...] = (
    # --- upcoming / current flight -------------------------------------------------
    JetlogSensorDescription(
        key="next_flight",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda d: d.current_or_next.best_departure if d.current_or_next else None,
        attrs_fn=lambda d: d.current_or_next.attributes() if d.current_or_next else None,
    ),
    JetlogSensorDescription(
        key="next_flight_route",
        value_fn=lambda d: d.current_or_next.title if d.current_or_next else None,
    ),
    JetlogSensorDescription(
        key="next_flight_status",
        value_fn=lambda d: _status(d.current_or_next, "status"),
        attrs_fn=lambda d: {"status_text": _status(d.current_or_next, "status_text"),
                            "flight_number": d.current_or_next.raw.get("flightNumber") if d.current_or_next else None},
    ),
    JetlogSensorDescription(
        key="next_flight_departure_delay",
        native_unit_of_measurement=UnitOfTime.MINUTES,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: _status(d.current_or_next, "departure_delay"),
    ),
    JetlogSensorDescription(
        key="next_flight_arrival_delay",
        native_unit_of_measurement=UnitOfTime.MINUTES,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: _status(d.current_or_next, "arrival_delay"),
    ),
    JetlogSensorDescription(
        key="next_flight_estimated_arrival",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda d: d.current_or_next.best_arrival if d.current_or_next else None,
    ),
    JetlogSensorDescription(
        key="upcoming_flights",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: len(d.upcoming),
        attrs_fn=lambda d: {"flights": [_brief(f) for f in d.upcoming[:UPCOMING_ATTRIBUTE_LIMIT]]},
    ),
    # --- history --------------------------------------------------------------------
    JetlogSensorDescription(
        key="last_flight",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda d: d.last_completed.best_arrival if d.last_completed else None,
        attrs_fn=lambda d: d.last_completed.attributes() if d.last_completed else None,
    ),
    JetlogSensorDescription(
        key="total_flights",
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d.statistics.get("totalFlights"),
        attrs_fn=lambda d: {"records": d.statistics.get("records"),
                            "most_visited_airports": d.statistics.get("mostVisitedAirports"),
                            "most_common_airlines": d.statistics.get("mostCommonAirlines"),
                            "top_routes": d.statistics.get("topRoutes"),
                            "top_aircraft": d.statistics.get("topAircraft")},
    ),
    JetlogSensorDescription(
        key="flights_this_year",
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: len(_year_flights(d)),
        attrs_fn=lambda d: {"distance_km": sum(f.raw.get("distance") or 0 for f in _year_flights(d)),
                            "duration_min": sum(f.raw.get("duration") or 0 for f in _year_flights(d))},
    ),
    JetlogSensorDescription(
        key="total_distance",
        device_class=SensorDeviceClass.DISTANCE,
        native_unit_of_measurement=UnitOfLength.KILOMETERS,
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=0,
        value_fn=lambda d: d.statistics.get("totalDistance"),
    ),
    JetlogSensorDescription(
        key="total_flight_time",
        device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        suggested_unit_of_measurement=UnitOfTime.HOURS,
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=0,
        value_fn=lambda d: d.statistics.get("totalDuration"),
    ),
    JetlogSensorDescription(
        key="airports_visited",
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d.statistics.get("totalUniqueAirports"),
    ),
    JetlogSensorDescription(
        key="countries_visited",
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d.statistics.get("visitedCountries"),
        attrs_fn=lambda d: {"most_common_countries": d.statistics.get("mostCommonCountries")},
    ),
    JetlogSensorDescription(
        key="total_co2",
        device_class=SensorDeviceClass.WEIGHT,
        native_unit_of_measurement=UnitOfMass.KILOGRAMS,
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=0,
        value_fn=lambda d: d.statistics.get("totalCo2Kg"),
    ),
    # --- delays -----------------------------------------------------------------------
    JetlogSensorDescription(
        key="on_time_percentage",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d.delay_summary.get("on_time_percentage"),
        attrs_fn=lambda d: {k: d.delay_summary.get(k) for k in
                            ("flights_tracked", "flights_landed", "on_time", "delayed", "canceled", "diverted")},
    ),
    JetlogSensorDescription(
        key="average_arrival_delay",
        native_unit_of_measurement=UnitOfTime.MINUTES,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d.delay_summary.get("average_arrival_delay"),
        attrs_fn=lambda d: {
            "average_departure_delay": d.delay_summary.get("average_departure_delay"),
            "total_delay_minutes": d.delay_summary.get("total_delay_minutes"),
            "worst": _summary_brief(d.delay_summary.get("worst")),
            "recent": [_summary_brief(r) for r in d.delay_summary.get("recent") or []],
        },
    ),
)


def _summary_brief(row: dict | None) -> dict | None:
    if not row:
        return None
    status = row.get("status") or {}
    return {
        "date": row.get("date"),
        "flight_number": row.get("flight_number"),
        "route": f"{row['origin'].get('iata') or row['origin']['icao']} → "
                 f"{row['destination'].get('iata') or row['destination']['icao']}",
        "status": status.get("status"),
        "departure_delay_min": status.get("departure_delay"),
        "arrival_delay_min": status.get("arrival_delay"),
    }


async def async_setup_entry(hass: HomeAssistant, entry: JetlogConfigEntry,
                            async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities(JetlogSensor(entry.runtime_data, description) for description in SENSORS)


class JetlogSensor(JetlogEntity, SensorEntity):
    entity_description: JetlogSensorDescription

    def __init__(self, coordinator, description: JetlogSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        return self.entity_description.attrs_fn(self.coordinator.data)
