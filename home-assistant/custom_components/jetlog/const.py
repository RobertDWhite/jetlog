"""Constants for the Jetlog integration."""

from datetime import timedelta

DOMAIN = "jetlog"

CONF_MAP_EXTENT = "map_extent"
MAP_EXTENT_AUTO = "auto"
MAP_EXTENT_WORLD = "world"

DEFAULT_URL = "https://jetlog.internal.white.fm"

# Live flight status is cheap unless a flight is in the window, so poll it often;
# the full flight list, statistics and map only change when flights are logged.
UPDATE_INTERVAL = timedelta(minutes=5)
SLOW_REFRESH_INTERVAL = timedelta(hours=1)

# Window jetlog looks up live FR24 status for.
STATUS_HOURS_BEHIND = 12
STATUS_HOURS_AHEAD = 48
# Days of recent flights whose delays get recorded each slow refresh.
BACKFILL_DAYS = 10
# Upcoming flights drawn on the map and listed in attributes.
UPCOMING_DAYS = 60
UPCOMING_ATTRIBUTE_LIMIT = 10
