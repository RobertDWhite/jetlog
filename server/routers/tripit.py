# TripIt ICS calendar import endpoint
# To integrate into main.py, add:
#   from server.routers import tripit
#   app.include_router(tripit.router, prefix="/api", dependencies=auth_dependency)

from server.db.session import get_db
from server.models import FlightModel, User
from server.routers.flights import add_flight
from server.internal.airport_utils import get_icao_from_iata
from server.internal.flight_utils import flight_already_exists
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session
from icalendar import Calendar
import datetime
import re
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/importing",
    tags=["importing/exporting"],
    redirect_slashes=True
)

# Regex to extract airport IATA code from TripIt LOCATION field
# Typical formats: "Airport Name (CODE)", "CODE - Airport Name", just "CODE"
IATA_PAREN_RE = re.compile(r'\(([A-Z]{3})\)')
IATA_PREFIX_RE = re.compile(r'^([A-Z]{3})\s*[-:]')
IATA_BARE_RE = re.compile(r'^([A-Z]{3})$')

# Regex to extract flight number from TripIt SUMMARY field
# Typical: "Flight to City - Airline AA123" or "AA 123" or "Airline 123"
FLIGHT_NUM_RE = re.compile(r'\b([A-Z]{2,3})\s*(\d{1,5})\b')


def _extract_iata_from_location(location: str) -> str | None:
    """Try to extract an IATA airport code from a TripIt LOCATION string."""
    if not location:
        return None

    location = location.strip()

    # Try "(CODE)" format first
    match = IATA_PAREN_RE.search(location)
    if match:
        return match.group(1)

    # Try "CODE - ..." format
    match = IATA_PREFIX_RE.match(location)
    if match:
        return match.group(1)

    # Try bare "CODE"
    match = IATA_BARE_RE.match(location)
    if match:
        return match.group(1)

    return None


def _extract_flight_number(summary: str) -> str | None:
    """Try to extract a flight number from a TripIt SUMMARY string."""
    if not summary:
        return None

    match = FLIGHT_NUM_RE.search(summary)
    if match:
        return f"{match.group(1)}{match.group(2)}"

    return None


def _parse_ical_datetime(dt_value) -> tuple[datetime.date | None, str | None]:
    """Parse an icalendar datetime into (date, time_str HH:MM).

    Handles both datetime and date objects from icalendar.
    """
    if dt_value is None:
        return None, None

    # icalendar may return a vDDDTypes wrapper; get the actual dt
    if hasattr(dt_value, 'dt'):
        dt_value = dt_value.dt

    if isinstance(dt_value, datetime.datetime):
        return dt_value.date(), dt_value.strftime('%H:%M')
    elif isinstance(dt_value, datetime.date):
        return dt_value, None

    return None, None


def _parse_airports_from_description(description: str) -> tuple[str | None, str | None]:
    """Try to extract origin and destination IATA codes from TripIt DESCRIPTION.

    TripIt descriptions often contain lines like:
    "Departs: SFO" / "Arrives: JFK"
    or airport names with codes in parentheses.
    """
    if not description:
        return None, None

    origin = None
    destination = None

    # Look for explicit departs/arrives patterns
    depart_match = re.search(r'(?:Depart|From|Origin)[s:]?\s*[:\-]?\s*(?:.*?\()?([A-Z]{3})\)?', description, re.IGNORECASE)
    arrive_match = re.search(r'(?:Arriv|To|Destination)[es:]?\s*[:\-]?\s*(?:.*?\()?([A-Z]{3})\)?', description, re.IGNORECASE)

    if depart_match:
        origin = depart_match.group(1).upper()
    if arrive_match:
        destination = arrive_match.group(1).upper()

    return origin, destination


@router.post("/tripit", status_code=202)
async def import_tripit_ics(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Import flights from a TripIt ICS calendar export.

    Accepts an uploaded .ics file, parses VEVENT entries for flight events,
    extracts flight details, and creates flight entries.
    Returns the count of imported flights.
    """
    if not file.filename or not file.filename.lower().endswith('.ics'):
        raise HTTPException(status_code=400, detail="File must be an .ics calendar file")

    try:
        content = await file.read()
        cal = Calendar.from_ical(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse ICS file: {e}")

    imported_flights: list[FlightModel] = []
    fail_count = 0
    skip_count = 0
    event_count = 0

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        event_count += 1
        summary = str(component.get('SUMMARY', '')) if component.get('SUMMARY') else ''
        location = str(component.get('LOCATION', '')) if component.get('LOCATION') else ''
        description = str(component.get('DESCRIPTION', '')) if component.get('DESCRIPTION') else ''

        # Skip non-flight events (basic heuristic)
        flight_keywords = ['flight', 'fly', 'air', 'airline', 'airport']
        combined_text = (summary + ' ' + description).lower()
        is_flight = any(kw in combined_text for kw in flight_keywords)

        # Also check if summary matches flight number pattern
        if not is_flight and FLIGHT_NUM_RE.search(summary):
            is_flight = True

        # If location contains airport codes, treat as flight
        if not is_flight and IATA_PAREN_RE.search(location):
            is_flight = True

        if not is_flight:
            skip_count += 1
            continue

        try:
            # Extract times
            dtstart = component.get('DTSTART')
            dtend = component.get('DTEND')

            dep_date, dep_time = _parse_ical_datetime(dtstart)
            arr_date, arr_time = _parse_ical_datetime(dtend)

            if not dep_date:
                logger.warning("[%d] Skipping event with no start date: %s", event_count, summary)
                fail_count += 1
                continue

            # Extract airports - try LOCATION field first
            origin_iata = None
            dest_iata = None

            if location:
                # TripIt sometimes puts both airports in location separated by " to " or " - "
                parts = re.split(r'\s+(?:to|->|\u2192|-)\s+', location, flags=re.IGNORECASE)
                if len(parts) == 2:
                    origin_iata = _extract_iata_from_location(parts[0])
                    dest_iata = _extract_iata_from_location(parts[1])
                else:
                    # Single location - might be destination only
                    dest_iata = _extract_iata_from_location(location)

            # Fall back to description if we don't have both airports
            if not origin_iata or not dest_iata:
                desc_origin, desc_dest = _parse_airports_from_description(description)
                if not origin_iata and desc_origin:
                    origin_iata = desc_origin
                if not dest_iata and desc_dest:
                    dest_iata = desc_dest

            if not origin_iata or not dest_iata:
                logger.warning("[%d] Could not extract origin/destination from event: %s", event_count, summary)
                fail_count += 1
                continue

            # Convert IATA to ICAO
            origin_icao = get_icao_from_iata(origin_iata)
            dest_icao = get_icao_from_iata(dest_iata)

            if not origin_icao:
                logger.warning("[%d] Unknown IATA code for origin: %s", event_count, origin_iata)
                fail_count += 1
                continue
            if not dest_icao:
                logger.warning("[%d] Unknown IATA code for destination: %s", event_count, dest_iata)
                fail_count += 1
                continue

            # Extract flight number
            flight_number = _extract_flight_number(summary)

            # Calculate duration if both times available
            duration = None
            if dep_time and arr_time and dep_date and arr_date:
                try:
                    dep_dt = datetime.datetime.combine(dep_date, datetime.time.fromisoformat(dep_time))
                    arr_dt = datetime.datetime.combine(arr_date, datetime.time.fromisoformat(arr_time))
                    delta_minutes = int((arr_dt - dep_dt).total_seconds() / 60)
                    if delta_minutes > 0:
                        duration = delta_minutes
                except (ValueError, TypeError):
                    pass

            # Build notes from description extras
            notes_parts = []
            # Extract seat info from description
            seat_match = re.search(r'Seat[:\s]+(\w+)', description, re.IGNORECASE)
            if seat_match:
                notes_parts.append(f"Seat: {seat_match.group(1)}")
            # Extract confirmation number
            conf_match = re.search(r'Confirmation[:\s#]+(\S+)', description, re.IGNORECASE)
            if conf_match:
                notes_parts.append(f"Confirmation: {conf_match.group(1)}")

            notes = "\n".join(notes_parts) if notes_parts else None

            values_dict = {
                'date': dep_date,
                'origin': origin_icao,
                'destination': dest_icao,
                'departure_time': dep_time,
                'arrival_time': arr_time,
                'arrival_date': arr_date if arr_date and arr_date != dep_date else None,
                'duration': duration,
                'flight_number': flight_number,
                'notes': notes,
            }

            flight = FlightModel(**values_dict)

            if flight_already_exists(flight, user.username):
                logger.info("[%d] Skipped duplicate flight: %s", event_count, summary)
                skip_count += 1
                continue

            imported_flights.append(flight)

        except Exception as e:
            logger.warning("[%d] Failed to parse event '%s': %s", event_count, summary, e)
            fail_count += 1

    # Import the parsed flights
    import_fail_count = 0
    for i, flight in enumerate(imported_flights):
        progress = f"[{i + 1}/{len(imported_flights)}]"
        try:
            res = await add_flight(flight, user=user, db=db)
            logger.info("%s Successfully imported TripIt flight (id: %s)", progress, res)
        except HTTPException as e:
            logger.warning("%s Failed to import TripIt flight: %s", progress, e.detail)
            import_fail_count += 1

    total_imported = len(imported_flights) - import_fail_count

    return {
        "events_found": event_count,
        "flights_imported": total_imported,
        "flights_skipped": skip_count,
        "flights_failed": fail_count + import_fail_count,
    }
