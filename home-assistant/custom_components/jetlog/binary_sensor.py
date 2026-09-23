"""In-flight binary sensor for Jetlog."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import JetlogConfigEntry
from .entity import JetlogEntity


async def async_setup_entry(hass: HomeAssistant, entry: JetlogConfigEntry,
                            async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([JetlogInFlight(entry.runtime_data, "in_flight")])


class JetlogInFlight(JetlogEntity, BinarySensorEntity):
    """On while one of your flights is airborne (FR24 live status, else the schedule)."""

    @property
    def is_on(self) -> bool:
        return self.coordinator.data.in_air is not None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        flight = self.coordinator.data.in_air
        return flight.attributes() if flight else None
