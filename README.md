# jetlog

<p align="center">
    <img src="https://img.shields.io/docker/pulls/pbogre/jetlog?style=for-the-badge" />
    <img src="https://img.shields.io/docker/image-size/pbogre/jetlog?style=for-the-badge" />
</p>

A self-hostable personal flight tracker and viewer with rich statistics, interactive maps, and multi-user support.

![homepage preview](images/homepage.png)|![all flights preview](images/all-flights.png)
:--------------------------------------:|:---------------------------------------------:

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Importing & Exporting](#importing--exporting)
- [Environment Variables](#environment-variables)
- [Privacy Notice](#privacy-notice)
- [Contributing](#contributing)
- [Stack](#stack)
- [Acknowledgements](#acknowledgements)

## Features

### Core
- ✈️ Add, edit, and delete flights with full detail tracking
- 🌍 Interactive world map with clickable airports and route tooltips
- 📊 Comprehensive statistics with charts, records, and achievements
- 🔐 Secure JWT authentication with multi-user support
- 📱 Responsive design with mobile-friendly flight tables
- 🌙 Dark mode

### Flight Management
- **Multi-leg trip builder** — add connected flights in one form with auto-filled origins and shared details
- **Bulk operations** — select multiple flights to edit (class, purpose, seat, side, airline) or delete at once
- **Flight ratings** — rate flights 1-5 stars, with per-airline averages in statistics
- **Photo attachments** — upload a photo per flight, browse all in the photo gallery
- **Duplicate detection** — warns before adding a flight with the same date and route
- **Flight enrichment** — backfill aircraft type, tail number, and times from FlightRadar24 and Flightera
- **Connection detection** — automatically links multi-leg trips based on matching airports and dates

### Views
- **Table view** — sortable columns, pagination, responsive column hiding on mobile
- **Timeline view** — flights grouped by month in a vertical timeline
- **Photo gallery** — grid view of all flight photos
- **Year in Review** — annual summary with top stats and highlights

### Statistics & Charts
- Flights and distance by month (bar/area charts)
- Top routes, aircraft, airports, airlines, and countries
- Flight records (longest, shortest, busiest day/month)
- Seat and class distribution
- Layover analytics (average, shortest, longest, busiest hub)
- CO2 emissions estimate with class-based multipliers
- Average speed, timezone count, continent completion
- Rating distribution and per-airline averages
- Calendar heatmap of flight activity
- Cost tracking with per-km and per-class breakdowns
- Achievement badges (30+ milestones across flights, distance, airports, countries, and more)

### Sharing & Export
- **Public profiles** — shareable profile page with stats and map (opt-in per user)
- **Export formats** — CSV, iCal, MyFlightRadar24 CSV, KML (Google Earth), printable flight log (PDF)
- **Import formats** — MyFlightRadar24, JetLog CSV, Flighty, custom CSV

### Other
- Filter flights by date range, user, and sort order with persistent filter settings
- Frequency-based map markers and route heat coloring
- Visited country highlighting on the world map
- Configurable metric/imperial units
- Audit logging of all flight creates, edits, and deletes
- Upcoming flights with countdown on the home page

Visit the [usage wiki](https://github.com/pbogre/jetlog/wiki/Usage) for details on all the features of Jetlog.

## Getting Started

Here's a sample `docker-compose.yml` to get started:
```yml
services:
  jetlog:
    image: pbogre/jetlog:latest
    volumes:
      - /your/data/path:/data
    environment:
        JETLOG_PORT: 3000
        SECRET_KEY: yourLongAndRandomStringOfCharacters123!
    restart: unless-stopped
    ports:
      - 3000:3000
```

Once up and running, the default admin account has username and password `admin`.
Make sure that you change the password after the first login!

For details about troubleshooting, environment variables, and more installation options
such as running Jetlog under a path prefix, have a look at the [installation wiki](https://github.com/pbogre/jetlog/wiki/Installation).

## Importing & Exporting

**Import from:** MyFlightRadar24, Flighty, JetLog CSV, custom CSV

**Export to:** CSV, iCal, MyFlightRadar24 CSV, KML (Google Earth), printable flight log

For details on how to import your data, have a look at the [importing wiki](https://github.com/pbogre/jetlog/wiki/Importing).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JETLOG_PORT` | `3000` | Port the server listens on |
| `SECRET_KEY` | *(required)* | Secret key for JWT token signing |
| `TOKEN_DURATION` | `7` | Token validity in days |
| `DATA_PATH` | `/data` | Path for database and photo storage |
| `ENABLE_EXTERNAL_APIS` | `true` | Enable external API calls (adsbdb, FlightRadar24) |
| `USE_IPV6` | `false` | Bind to IPv6 |
| `PUID` / `PGID` | `1000` | User/group ID for file permissions |
| `FR24_EMAIL` | | FlightRadar24 account email (for sync) |
| `FR24_PASSWORD` | | FlightRadar24 account password (for sync) |
| `FLIGHTERA_API_KEY` | | Flightera API key (for flight enrichment fallback) |

## Privacy Notice

Jetlog itself does not collect any user data outside of your own setup. However,
it relies on external APIs ([adsbdb](https://www.adsbdb.com/), [FlightRadar24](https://www.flightradar24.com/)) for some features
such as flight enrichment and airline lookup. Since you cannot always
be sure of how external APIs use your data, you may wish to opt out of these by setting
the `ENABLE_EXTERNAL_APIS` environment variable to `false`.

## Contributing

If you would like to contribute to this project by opening an issue or a pull request,
please read [CONTRIBUTING.md](https://github.com/pbogre/jetlog/blob/main/CONTRIBUTING.md).

## Stack

- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLite](https://www.sqlite.org/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Recharts](https://recharts.org/)
- [react-simple-maps](https://www.react-simple-maps.io/)

## Acknowledgements

- [Favicon](https://www.flaticon.com/free-icon/flight_16863550?term=plane&page=1&position=36&origin=search&related_id=16863550)
- [Airports data](https://ourairports.com/)
- [World GeoJSON](https://geojson-maps.kyd.au/)
- [adsbdb API](https://www.adsbdb.com/)
