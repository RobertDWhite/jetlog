"""Config flow for Jetlog."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_API_KEY, CONF_URL, CONF_VERIFY_SSL
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import SelectSelector, SelectSelectorConfig, SelectSelectorMode

from .api import JetlogAuthError, JetlogClient, JetlogError
from .const import CONF_MAP_EXTENT, DEFAULT_URL, DOMAIN, MAP_EXTENT_AUTO, MAP_EXTENT_WORLD


class JetlogConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up Jetlog with its URL and an API key."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            await self.async_set_unique_id(url)
            self._abort_if_unique_id_configured()
            client = JetlogClient(async_get_clientsession(self.hass, user_input[CONF_VERIFY_SSL]),
                                  url, user_input[CONF_API_KEY])
            try:
                await client.statistics()
            except JetlogAuthError:
                errors["base"] = "invalid_auth"
            except JetlogError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(title="Jetlog", data={**user_input, CONF_URL: url})

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_URL, default=DEFAULT_URL): str,
                vol.Required(CONF_API_KEY): str,
                vol.Required(CONF_VERIFY_SSL, default=True): bool,
            }),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return JetlogOptionsFlow()


class JetlogOptionsFlow(OptionsFlow):
    """Map extent option."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required(CONF_MAP_EXTENT,
                             default=self.config_entry.options.get(CONF_MAP_EXTENT, MAP_EXTENT_AUTO)):
                    SelectSelector(SelectSelectorConfig(
                        options=[MAP_EXTENT_AUTO, MAP_EXTENT_WORLD],
                        translation_key=CONF_MAP_EXTENT,
                        mode=SelectSelectorMode.LIST,
                    )),
            }),
        )
