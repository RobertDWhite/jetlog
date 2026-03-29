from server.db.session import get_db
from server.internal.airport_utils import get_icao_from_iata
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta

router = APIRouter(
    prefix="/boarding-pass",
    tags=["boarding-pass"],
    redirect_slashes=True
)

# IATA BCBP compartment code to ticket class mapping
CLASS_MAP = {
    'F': 'first', 'P': 'first', 'A': 'first',
    'J': 'business', 'C': 'business', 'D': 'business', 'I': 'business',
    'W': 'economy+',
    'Y': 'economy', 'B': 'economy', 'H': 'economy',
    'K': 'economy', 'L': 'economy', 'M': 'economy', 'N': 'economy',
    'Q': 'economy', 'T': 'economy', 'V': 'economy', 'X': 'economy',
    'G': 'economy', 'S': 'economy', 'O': 'economy', 'E': 'economy',
    'U': 'economy', 'R': 'economy',
}


def _seat_type_from_letter(letter: str) -> str | None:
    """Infer seat type from seat letter.

    Common narrow-body 3-3 config: A/F = window, B/E = middle, C/D = aisle.
    Common wide-body 2-3-2: A/K = window, C/D/G/H = aisle, B/E/F/J = middle.
    We use a best-effort heuristic covering the most common layouts.
    """
    letter = letter.upper()
    if letter in ('A', 'F', 'K'):
        return 'window'
    elif letter in ('C', 'D', 'G', 'H'):
        return 'aisle'
    elif letter in ('B', 'E', 'J'):
        return 'middle'
    return None


def _julian_to_date(julian_str: str) -> date:
    """Convert 3-digit Julian day-of-year to a date.

    Assumes current year; if the resulting date is more than 30 days in the
    past, assumes next year instead.
    """
    day_of_year = int(julian_str)
    if day_of_year < 1 or day_of_year > 366:
        raise ValueError(f"Invalid Julian date: {julian_str}")

    current_year = date.today().year
    flight_date = date(current_year, 1, 1) + timedelta(days=day_of_year - 1)

    if flight_date < date.today() - timedelta(days=30):
        flight_date = date(current_year + 1, 1, 1) + timedelta(days=day_of_year - 1)

    return flight_date


def _parse_leg(raw: str, offset: int, is_first: bool) -> tuple[dict, int]:
    """Parse a single BCBP leg starting at offset.

    First leg mandatory unique section is 23 chars (positions 0-22 of raw).
    Each leg repeated section (first or subsequent) is 36 chars minimum for
    the mandatory portion.

    Returns (parsed_leg_dict, new_offset).
    """
    if is_first:
        # First leg mandatory repeated fields start at position 23
        leg_start = 23
    else:
        leg_start = offset

    remaining = raw[leg_start:]
    if len(remaining) < 35:
        raise ValueError(f"Leg data too short at offset {leg_start}: need 35 chars, got {len(remaining)}")

    # Mandatory repeated fields for each leg (relative to leg_start)
    # Positions within each leg's repeated section:
    #  0-2:  PNR / Booking reference (7 chars) -- only for first leg in global mandatory
    #  We use the absolute positions for first leg since the spec is clear.
    # For first leg, the positions in the raw string are:
    if is_first:
        pnr = raw[23:30].strip()
        origin_iata = raw[30:33].strip()
        dest_iata = raw[33:36].strip()
        carrier_iata = raw[36:39].strip()
        flight_num = raw[39:44].strip()
        julian_date = raw[44:47]
        compartment = raw[47]
        seat = raw[48:52].strip()
        checkin_seq = raw[52:57].strip()
        passenger_status = raw[57] if len(raw) > 57 else ''
        new_offset = 58
    else:
        # Subsequent legs: repeated mandatory fields only (no PNR)
        # Each subsequent leg repeated mandatory = 26 chars
        # Layout: PNR(7) + from(3) + to(3) + carrier(3) + flight(5) + julian(3) + compartment(1) + seat(4) + seq(5) + status(1)
        # But PNR is only in first leg's mandatory unique section.
        # Actually per BCBP spec, subsequent legs have:
        # Operating carrier PNR code (7 chars) is in repeated section for ALL legs
        pnr = remaining[0:7].strip()
        origin_iata = remaining[7:10].strip()
        dest_iata = remaining[10:13].strip()
        carrier_iata = remaining[13:16].strip()
        flight_num = remaining[16:21].strip()
        julian_date = remaining[21:24]
        compartment = remaining[24]
        seat = remaining[25:29].strip()
        checkin_seq = remaining[29:34].strip()
        passenger_status = remaining[34] if len(remaining) > 34 else ''
        new_offset = leg_start + 35

    # Convert Julian date to actual date
    flight_date = _julian_to_date(julian_date)

    # Resolve IATA to ICAO
    origin_icao = get_icao_from_iata(origin_iata) or origin_iata
    dest_icao = get_icao_from_iata(dest_iata) or dest_iata

    # Map compartment to ticket class
    ticket_class = CLASS_MAP.get(compartment.upper(), 'economy')

    # Determine seat type from seat letter
    seat_type = None
    if seat and seat[-1].isalpha():
        seat_type = _seat_type_from_letter(seat[-1])

    # Resolve airline IATA to ICAO
    airline_icao = None
    if carrier_iata:
        from server.db.session import SessionLocal
        from server.db.models import Airline as AirlineDB
        from sqlalchemy import func as sqla_func
        with SessionLocal() as session:
            airline_row = session.query(AirlineDB).filter(
                sqla_func.lower(AirlineDB.iata) == carrier_iata.lower()
            ).first()
            if airline_row:
                airline_icao = airline_row.icao

    return {
        "pnr": pnr,
        "origin": origin_icao,
        "destination": dest_icao,
        "originIata": origin_iata,
        "destinationIata": dest_iata,
        "carrier": carrier_iata,
        "carrierIcao": airline_icao,
        "flightNumber": f"{carrier_iata}{flight_num}",
        "date": flight_date.isoformat(),
        "ticketClass": ticket_class,
        "compartmentCode": compartment,
        "seatNumber": seat,
        "seatType": seat_type,
    }, new_offset


@router.post("/parse")
def parse_boarding_pass(data: dict, db: Session = Depends(get_db)):
    raw = data.get("raw", "").strip()

    if len(raw) < 58:
        raise HTTPException(400, "Invalid BCBP data: too short (need at least 58 characters)")

    format_code = raw[0]
    if format_code != 'M':
        raise HTTPException(400, f"Invalid BCBP format code: expected 'M', got '{format_code}'")

    try:
        num_legs = int(raw[1])
    except ValueError:
        raise HTTPException(400, f"Invalid number of legs: '{raw[1]}'")

    if num_legs < 1 or num_legs > 9:
        raise HTTPException(400, f"Invalid number of legs: {num_legs}")

    # Parse passenger name (positions 2-21, 20 chars)
    passenger_name = raw[2:22].strip()

    # Electronic ticket indicator (position 22)
    # e_ticket = raw[22]

    # Parse first leg
    legs = []
    try:
        first_leg, offset = _parse_leg(raw, 0, is_first=True)
        first_leg["passengerName"] = passenger_name
        legs.append(first_leg)
    except (ValueError, IndexError) as e:
        raise HTTPException(400, f"Failed to parse first leg: {e}")

    # Parse subsequent legs
    for i in range(1, num_legs):
        try:
            leg, offset = _parse_leg(raw, offset, is_first=False)
            leg["passengerName"] = passenger_name
            legs.append(leg)
        except (ValueError, IndexError) as e:
            # Subsequent legs may fail if the barcode is truncated or has
            # conditional sections we can't parse; return what we have.
            print(f"Warning: failed to parse leg {i + 1}: {e}")
            break

    if len(legs) == 1:
        return legs[0]

    return {"legs": legs, "numLegs": len(legs)}
