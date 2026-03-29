from server.db.session import get_db
from server.models import FlightModel, FlightPurpose, SeatType, ClassType, User
from server.routers.flights import add_flight
from server.internal.airport_utils import get_icao_from_iata
from server.internal.flight_utils import flight_already_exists
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session
import datetime
import csv
import io

router = APIRouter(
    prefix="/importing",
    tags=["importing/exporting"],
    redirect_slashes=True
)


def _parse_duration_hhmm(duration_str: str) -> int | None:
    """Parse a duration string like '5h 30m', '5:30', '330', or 'HH:MM:SS' into minutes."""
    if not duration_str or not duration_str.strip():
        return None

    duration_str = duration_str.strip()

    # Try HH:MM:SS format
    if ":" in duration_str:
        parts = duration_str.split(":")
        try:
            if len(parts) == 3:
                return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            pass

    # Try "Xh Ym" format
    if "h" in duration_str.lower():
        try:
            hours = 0
            minutes = 0
            lower = duration_str.lower().replace("m", "").strip()
            if "h" in lower:
                h_parts = lower.split("h")
                hours = int(h_parts[0].strip())
                if h_parts[1].strip():
                    minutes = int(h_parts[1].strip())
            return hours * 60 + minutes
        except ValueError:
            pass

    # Try plain integer (minutes)
    try:
        return int(duration_str)
    except ValueError:
        return None


def _parse_time_hhmm(time_str: str) -> str | None:
    """Parse a time string into HH:MM format. Accepts HH:MM, HH:MM:SS, etc."""
    if not time_str or not time_str.strip():
        return None

    time_str = time_str.strip()

    # Handle ISO datetime strings like '2026-01-15T14:30:00'
    if "T" in time_str:
        time_str = time_str.split("T")[1]

    # Take just HH:MM
    parts = time_str.split(":")
    if len(parts) >= 2:
        try:
            hh = int(parts[0])
            mm = int(parts[1])
            return f"{hh:02d}:{mm:02d}"
        except ValueError:
            pass

    return None


def _parse_date(date_str: str) -> datetime.date | None:
    """Parse date from various formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, etc."""
    if not date_str or not date_str.strip():
        return None

    date_str = date_str.strip()

    # Try ISO format first
    try:
        return datetime.date.fromisoformat(date_str)
    except ValueError:
        pass

    # Try DD/MM/YYYY
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y",
                "%d.%m.%Y", "%m.%d.%Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    return None


def _resolve_airport(code: str, db: Session) -> str | None:
    """Resolve an airport code to ICAO. If already ICAO (4 chars), validate it.
    If IATA (3 chars), convert to ICAO."""
    if not code or not code.strip():
        return None

    code = code.strip().upper()

    if len(code) == 4:
        # Likely ICAO already
        return code
    elif len(code) == 3:
        # Likely IATA, convert to ICAO
        icao = get_icao_from_iata(code)
        return icao
    else:
        # Try as IATA first, then as-is
        icao = get_icao_from_iata(code)
        return icao if icao else code


def _map_seat_type(seat_str: str) -> SeatType | None:
    """Map various seat type strings to SeatType enum."""
    if not seat_str or not seat_str.strip():
        return None

    seat_lower = seat_str.strip().lower()
    mapping = {
        "window": SeatType.WINDOW,
        "w": SeatType.WINDOW,
        "middle": SeatType.MIDDLE,
        "m": SeatType.MIDDLE,
        "center": SeatType.MIDDLE,
        "aisle": SeatType.AISLE,
        "a": SeatType.AISLE,
    }
    return mapping.get(seat_lower)


def _map_class_type(class_str: str) -> ClassType | None:
    """Map various class strings to ClassType enum."""
    if not class_str or not class_str.strip():
        return None

    class_lower = class_str.strip().lower()
    mapping = {
        "economy": ClassType.ECONOMY,
        "eco": ClassType.ECONOMY,
        "y": ClassType.ECONOMY,
        "coach": ClassType.ECONOMY,
        "economy+": ClassType.ECONOMYPLUS,
        "economy plus": ClassType.ECONOMYPLUS,
        "premium economy": ClassType.ECONOMYPLUS,
        "premium_economy": ClassType.ECONOMYPLUS,
        "premium": ClassType.ECONOMYPLUS,
        "w": ClassType.ECONOMYPLUS,
        "business": ClassType.BUSINESS,
        "biz": ClassType.BUSINESS,
        "j": ClassType.BUSINESS,
        "c": ClassType.BUSINESS,
        "first": ClassType.FIRST,
        "f": ClassType.FIRST,
        "private": ClassType.PRIVATE,
        "p": ClassType.PRIVATE,
    }
    return mapping.get(class_lower)


async def _import_flights(imported_flights: list[FlightModel],
                          user: User,
                          db: Session) -> dict:
    """Common import logic: insert parsed flights and return result summary."""
    success_count = 0
    fail_count = 0

    print(f"Importing {len(imported_flights)} flights...")
    for i, flight in enumerate(imported_flights):
        progress = f"[{i + 1}/{len(imported_flights)}]"
        try:
            res = await add_flight(flight, user=user, db=db)
            print(f"{progress} Successfully added flight (id: {res})")
            success_count += 1
        except HTTPException as e:
            print(f"{progress} Failed import: {e.detail}")
            fail_count += 1

    print(f"Importing process complete: {success_count} succeeded, {fail_count} failed")
    return {"imported": success_count, "failed": fail_count}


@router.post("/appintheair", status_code=202)
async def import_appintheair(file: UploadFile,
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    """
    Import flights from App in the Air CSV export.
    Expected columns: Date, Flight Number, From (IATA), To (IATA), Departure,
    Arrival, Duration, Airline, Aircraft, Seat, Class
    """
    imported_flights: list[FlightModel] = []
    fail_count = 0

    csv_data = io.TextIOWrapper(file.file, encoding="utf-8", newline="")
    reader = csv.reader(csv_data, quotechar='"', delimiter=",")

    header = None
    count = 0

    for row in reader:
        if not row or all(col.strip() == "" for col in row):
            continue

        if count == 0:
            header = [col.strip() for col in row]
            # Validate that we have at least the minimum expected columns
            required = ["Date", "Flight Number", "From", "To"]
            # Be flexible: accept "From (IATA)" or just "From"
            normalized_header = []
            for h in header:
                # Normalize common variants
                if h.lower().startswith("from"):
                    normalized_header.append("From")
                elif h.lower().startswith("to"):
                    normalized_header.append("To")
                else:
                    normalized_header.append(h)
            header = normalized_header

            missing = [col for col in required if col not in header]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid App in the Air CSV: missing columns {missing}"
                )
            count += 1
            continue

        row_data = dict(zip(header, row))

        try:
            values_dict = {}

            # Date
            parsed_date = _parse_date(row_data.get("Date", ""))
            if not parsed_date:
                raise ValueError(f"Cannot parse date: '{row_data.get('Date', '')}'")
            values_dict["date"] = parsed_date

            # Airports (IATA -> ICAO)
            origin_icao = _resolve_airport(row_data.get("From", ""), db)
            destination_icao = _resolve_airport(row_data.get("To", ""), db)
            if not origin_icao or not destination_icao:
                raise ValueError(
                    f"Unknown airport code(s): origin='{row_data.get('From', '')}', "
                    f"destination='{row_data.get('To', '')}'"
                )
            values_dict["origin"] = origin_icao
            values_dict["destination"] = destination_icao

            # Flight number
            flight_num = row_data.get("Flight Number", "").strip()
            if flight_num:
                values_dict["flight_number"] = flight_num

            # Times
            dep_time = _parse_time_hhmm(row_data.get("Departure", ""))
            if dep_time:
                values_dict["departure_time"] = dep_time

            arr_time = _parse_time_hhmm(row_data.get("Arrival", ""))
            if arr_time:
                values_dict["arrival_time"] = arr_time

            # Duration
            duration = _parse_duration_hhmm(row_data.get("Duration", ""))
            if duration:
                values_dict["duration"] = duration

            # Airline (try to resolve IATA to ICAO)
            airline_str = row_data.get("Airline", "").strip()
            if airline_str:
                # App in the Air may provide airline name or IATA code
                from server.db.models import Airline as AirlineDB
                from sqlalchemy import func as sqla_func
                airline_row = db.query(AirlineDB).filter(
                    (sqla_func.lower(AirlineDB.iata) == airline_str.lower()) |
                    (sqla_func.lower(AirlineDB.name) == airline_str.lower()) |
                    (sqla_func.lower(AirlineDB.icao) == airline_str.lower())
                ).first()
                if airline_row:
                    values_dict["airline"] = airline_row.icao

            # Aircraft
            aircraft = row_data.get("Aircraft", "").strip()
            if aircraft:
                values_dict["airplane"] = aircraft

            # Seat type
            seat = _map_seat_type(row_data.get("Seat", ""))
            if seat:
                values_dict["seat"] = seat

            # Class
            ticket_class = _map_class_type(row_data.get("Class", ""))
            if ticket_class:
                values_dict["ticket_class"] = ticket_class

            flight = FlightModel(**values_dict)

            if flight_already_exists(flight, user.username):
                print(f"[{count}] Skipped duplicate flight.")
                count += 1
                continue

            imported_flights.append(flight)

        except Exception as e:
            print(f"[{count}] Failed to parse: '{e}'")
            fail_count += 1

        count += 1

    result = await _import_flights(imported_flights, user, db)
    result["failed"] += fail_count
    return result


@router.post("/openflights", status_code=202)
async def import_openflights(file: UploadFile,
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    """
    Import flights from OpenFlights CSV export.
    Expected columns: Date, From, To, Flight_Number, Airline, Distance, Duration,
    Seat, Type, Seat_Type, Class, Reason, Note, Plane, Registration, Trip
    """
    imported_flights: list[FlightModel] = []
    fail_count = 0

    csv_data = io.TextIOWrapper(file.file, encoding="utf-8", newline="")
    reader = csv.reader(csv_data, quotechar='"', delimiter=",")

    header = None
    count = 0

    for row in reader:
        if not row or all(col.strip() == "" for col in row):
            continue

        if count == 0:
            header = [col.strip() for col in row]
            required = ["Date", "From", "To"]
            missing = [col for col in required if col not in header]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid OpenFlights CSV: missing columns {missing}"
                )
            count += 1
            continue

        row_data = dict(zip(header, row))

        try:
            values_dict = {}

            # Date
            parsed_date = _parse_date(row_data.get("Date", ""))
            if not parsed_date:
                raise ValueError(f"Cannot parse date: '{row_data.get('Date', '')}'")
            values_dict["date"] = parsed_date

            # Airports - OpenFlights uses IATA codes typically
            origin_icao = _resolve_airport(row_data.get("From", ""), db)
            destination_icao = _resolve_airport(row_data.get("To", ""), db)
            if not origin_icao or not destination_icao:
                raise ValueError(
                    f"Unknown airport code(s): origin='{row_data.get('From', '')}', "
                    f"destination='{row_data.get('To', '')}'"
                )
            values_dict["origin"] = origin_icao
            values_dict["destination"] = destination_icao

            # Flight number
            flight_num = row_data.get("Flight_Number", "").strip()
            if flight_num:
                values_dict["flight_number"] = flight_num

            # Airline (try to resolve)
            airline_str = row_data.get("Airline", "").strip()
            if airline_str:
                from server.db.models import Airline as AirlineDB
                from sqlalchemy import func as sqla_func
                airline_row = db.query(AirlineDB).filter(
                    (sqla_func.lower(AirlineDB.iata) == airline_str.lower()) |
                    (sqla_func.lower(AirlineDB.name) == airline_str.lower()) |
                    (sqla_func.lower(AirlineDB.icao) == airline_str.lower())
                ).first()
                if airline_row:
                    values_dict["airline"] = airline_row.icao

            # Distance
            distance_str = row_data.get("Distance", "").strip()
            if distance_str:
                try:
                    values_dict["distance"] = int(float(distance_str))
                except ValueError:
                    pass

            # Duration
            duration = _parse_duration_hhmm(row_data.get("Duration", ""))
            if duration:
                values_dict["duration"] = duration

            # Seat type
            seat = _map_seat_type(row_data.get("Seat_Type", ""))
            if seat:
                values_dict["seat"] = seat

            # Seat number
            seat_number = row_data.get("Seat", "").strip()
            if seat_number:
                values_dict["seat_number"] = seat_number

            # Class
            ticket_class = _map_class_type(row_data.get("Class", ""))
            if ticket_class:
                values_dict["ticket_class"] = ticket_class

            # Purpose / Reason
            reason_str = row_data.get("Reason", "").strip().lower()
            if reason_str:
                purpose_map = {
                    "leisure": FlightPurpose.LEISURE,
                    "personal": FlightPurpose.LEISURE,
                    "vacation": FlightPurpose.LEISURE,
                    "business": FlightPurpose.BUSINESS,
                    "work": FlightPurpose.BUSINESS,
                    "crew": FlightPurpose.CREW,
                    "other": FlightPurpose.OTHER,
                }
                purpose = purpose_map.get(reason_str)
                if purpose:
                    values_dict["purpose"] = purpose

            # Notes
            note = row_data.get("Note", "").strip()
            trip = row_data.get("Trip", "").strip()
            notes_parts = []
            if note:
                notes_parts.append(note)
            if trip:
                notes_parts.append(f"Trip: {trip}")
            if notes_parts:
                values_dict["notes"] = "\n".join(notes_parts)

            # Plane / Aircraft type
            plane = row_data.get("Plane", "").strip()
            if plane:
                values_dict["airplane"] = plane

            # Registration / Tail number
            registration = row_data.get("Registration", "").strip()
            if registration:
                values_dict["tail_number"] = registration

            flight = FlightModel(**values_dict)

            if flight_already_exists(flight, user.username):
                print(f"[{count}] Skipped duplicate flight.")
                count += 1
                continue

            imported_flights.append(flight)

        except Exception as e:
            print(f"[{count}] Failed to parse: '{e}'")
            fail_count += 1

        count += 1

    result = await _import_flights(imported_flights, user, db)
    result["failed"] += fail_count
    return result


@router.post("/flightdiary", status_code=202)
async def import_flightdiary(file: UploadFile,
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    """
    Import flights from FlightDiary.net CSV export.
    Expected columns: Date, Flight Number, From (IATA), To (IATA), Departure Time,
    Arrival Time, Aircraft, Registration, Seat, Class, Note
    """
    imported_flights: list[FlightModel] = []
    fail_count = 0

    csv_data = io.TextIOWrapper(file.file, encoding="utf-8", newline="")
    reader = csv.reader(csv_data, quotechar='"', delimiter=",")

    header = None
    count = 0

    for row in reader:
        if not row or all(col.strip() == "" for col in row):
            continue

        if count == 0:
            header = [col.strip() for col in row]
            # Normalize header to handle "From (IATA)" / "To (IATA)" variants
            normalized_header = []
            for h in header:
                h_lower = h.lower()
                if h_lower.startswith("from"):
                    normalized_header.append("From")
                elif h_lower.startswith("to") and ("iata" in h_lower or h_lower == "to"):
                    normalized_header.append("To")
                elif h_lower == "departure time":
                    normalized_header.append("Departure Time")
                elif h_lower == "arrival time":
                    normalized_header.append("Arrival Time")
                elif h_lower == "flight number":
                    normalized_header.append("Flight Number")
                else:
                    normalized_header.append(h)
            header = normalized_header

            required = ["Date", "From", "To"]
            missing = [col for col in required if col not in header]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid FlightDiary CSV: missing columns {missing}"
                )
            count += 1
            continue

        row_data = dict(zip(header, row))

        try:
            values_dict = {}

            # Date
            parsed_date = _parse_date(row_data.get("Date", ""))
            if not parsed_date:
                raise ValueError(f"Cannot parse date: '{row_data.get('Date', '')}'")
            values_dict["date"] = parsed_date

            # Airports (IATA -> ICAO)
            origin_icao = _resolve_airport(row_data.get("From", ""), db)
            destination_icao = _resolve_airport(row_data.get("To", ""), db)
            if not origin_icao or not destination_icao:
                raise ValueError(
                    f"Unknown airport code(s): origin='{row_data.get('From', '')}', "
                    f"destination='{row_data.get('To', '')}'"
                )
            values_dict["origin"] = origin_icao
            values_dict["destination"] = destination_icao

            # Flight number
            flight_num = row_data.get("Flight Number", "").strip()
            if flight_num:
                values_dict["flight_number"] = flight_num

            # Times
            dep_time = _parse_time_hhmm(row_data.get("Departure Time", ""))
            if dep_time:
                values_dict["departure_time"] = dep_time

            arr_time = _parse_time_hhmm(row_data.get("Arrival Time", ""))
            if arr_time:
                values_dict["arrival_time"] = arr_time

            # Aircraft
            aircraft = row_data.get("Aircraft", "").strip()
            if aircraft:
                values_dict["airplane"] = aircraft

            # Registration / Tail number
            registration = row_data.get("Registration", "").strip()
            if registration:
                values_dict["tail_number"] = registration

            # Seat type
            seat = _map_seat_type(row_data.get("Seat", ""))
            if seat:
                values_dict["seat"] = seat

            # Class
            ticket_class = _map_class_type(row_data.get("Class", ""))
            if ticket_class:
                values_dict["ticket_class"] = ticket_class

            # Note
            note = row_data.get("Note", "").strip()
            if note:
                values_dict["notes"] = note

            flight = FlightModel(**values_dict)

            if flight_already_exists(flight, user.username):
                print(f"[{count}] Skipped duplicate flight.")
                count += 1
                continue

            imported_flights.append(flight)

        except Exception as e:
            print(f"[{count}] Failed to parse: '{e}'")
            fail_count += 1

        count += 1

    result = await _import_flights(imported_flights, user, db)
    result["failed"] += fail_count
    return result
