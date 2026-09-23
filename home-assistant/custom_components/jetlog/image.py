"""Travel map image for Jetlog."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.image import ImageEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import JetlogConfigEntry, JetlogCoordinator
from .entity import JetlogEntity


async def async_setup_entry(hass: HomeAssistant, entry: JetlogConfigEntry,
                            async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([JetlogTravelMap(hass, entry.runtime_data)])


class JetlogTravelMap(JetlogEntity, ImageEntity):
    """Every route flown (width = how often) plus upcoming flights, as an SVG."""

    _attr_content_type = "image/svg+xml"

    def __init__(self, hass: HomeAssistant, coordinator: JetlogCoordinator) -> None:
        JetlogEntity.__init__(self, coordinator, "travel_map")
        ImageEntity.__init__(self, hass)
        self._attr_image_last_updated = coordinator.data.map_updated

    @callback
    def _handle_coordinator_update(self) -> None:
        if self.coordinator.data.map_updated != self._attr_image_last_updated:
            self._attr_image_last_updated = self.coordinator.data.map_updated
        super()._handle_coordinator_update()

    @property
    def image_last_updated(self) -> datetime | None:
        return self._attr_image_last_updated

    async def async_image(self) -> bytes | None:
        return self.coordinator.data.map_svg
