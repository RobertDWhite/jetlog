# Jetlog for Home Assistant

Custom integration that pulls upcoming flights, flight history, delays and a travel map from jetlog.

Needs jetlog with the `/api/flight-status` endpoints (2.2.12+); jetlog does the FR24 lookups itself,
so Home Assistant never talks to FlightRadar24.

## Install

Copy `custom_components/jetlog` to `/config/custom_components/`, restart, then add **Jetlog** under
Settings → Devices & services with the jetlog URL and an API key (jetlog → Settings → API keys).

## Entities

| Entity | What |
|---|---|
| `sensor.jetlog_next_flight` | Departure of the current/next flight (timestamp); full details as attributes |
| `sensor.jetlog_next_flight_route` / `_status` / `_arrival` | e.g. `DL4999 LGA → CVG`, FR24 status, best-known arrival |
| `sensor.jetlog_next_flight_departure_delay` / `_arrival_delay` | Minutes vs. schedule (negative = early); live within 48 h of departure |
| `binary_sensor.jetlog_in_flight` | On while one of your flights is airborne |
| `sensor.jetlog_upcoming_flights` | Count, with the next 10 as a `flights` attribute |
| `sensor.jetlog_last_flight` | Arrival of the last completed flight |
| `sensor.jetlog_total_flights`, `_flights_this_year`, `_total_distance_flown`, `_total_flight_time`, `_airports_visited`, `_countries_visited`, `_total_flight_co2` | History statistics (flights up to today) |
| `sensor.jetlog_on_time_arrivals`, `_average_arrival_delay` | Delay stats over flights with recorded delays; recent/worst as attributes |
| `calendar.jetlog_flights` | Every flight as an event (actual times once known) |
| `image.jetlog_travel_map` | SVG map: routes flown (width = frequency), upcoming routes dashed, visited countries shaded |

Live status refreshes every 5 minutes; the flight list, statistics, map and delay backfill hourly.
Delays are recorded from FR24's flight history, which only reaches back about a week, so flights
before the integration was installed have no delay data. Flight notes are never exposed (they hold
confirmation and ticket numbers).
