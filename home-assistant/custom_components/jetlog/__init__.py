"""Jetlog: upcoming flights, flight history, delays and a travel map from a jetlog server."""

from __future__ import annotations

from homeassistant.const import CONF_API_KEY, CONF_URL, CONF_VERIFY_SSL, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import JetlogClient
from .coordinator import JetlogConfigEntry, JetlogCoordinator

PLATFORMS = [Platform.BINARY_SENSOR, Platform.CALENDAR, Platform.IMAGE, Platform.SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: JetlogConfigEntry) -> bool:
    client = JetlogClient(
        async_get_clientsession(hass, entry.data.get(CONF_VERIFY_SSL, True)),
        entry.data[CONF_URL],
        entry.data[CONF_API_KEY],
    )
    coordinator = JetlogCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: JetlogConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_options_updated(hass: HomeAssistant, entry: JetlogConfigEntry) -> None:
    entry.runtime_data.force_full_refresh()
    await entry.runtime_data.async_request_refresh()
