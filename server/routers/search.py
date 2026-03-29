from server.db.session import get_db
from server.db.models import Flight, Airport, Airline
from server.models import User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

router = APIRouter(
    prefix="/search",
    tags=["search"],
    redirect_slashes=True
)


@router.get("", status_code=200)
async def global_search(q: str,
                        db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """
    Global search endpoint for the Cmd+K palette.
    Returns categorized results across flights, airports, and airlines.
    """
    if not q or len(q.strip()) == 0:
        return {"flights": [], "airports": [], "airlines": []}

    lower_q = q.strip().lower()
    like_q = f"%{lower_q}%"

    # --- Flights: search flight_number, origin, destination ---
    flight_results = db.query(Flight).filter(
        Flight.username == user.username,
        (
            func.lower(Flight.flight_number).like(like_q) |
            func.lower(Flight.origin).like(like_q) |
            func.lower(Flight.destination).like(like_q)
        )
    ).order_by(Flight.date.desc()).limit(5).all()

    flights = []
    for f in flight_results:
        # Look up airline name from ICAO code if available
        airline_icao = None
        if f.airline:
            airline_icao = f.airline

        flights.append({
            "id": f.id,
            "date": f.date,
            "origin": f.origin,
            "destination": f.destination,
            "flightNumber": f.flight_number,
            "airline": airline_icao,
        })

    # --- Airports: search ICAO, IATA, name, city ---
    airport_results = db.query(Airport).filter(
        (func.lower(Airport.icao).like(like_q)) |
        (func.lower(Airport.iata).like(like_q)) |
        (func.lower(Airport.name).like(like_q)) |
        (func.lower(Airport.municipality).like(like_q))
    ).order_by(
        (func.lower(Airport.iata) == lower_q).desc(),
        (func.lower(Airport.icao) == lower_q).desc(),
        (func.lower(Airport.name) == lower_q).desc(),
        func.length(Airport.name).asc(),
    ).limit(5).all()

    airports = []
    for ap in airport_results:
        airports.append({
            "icao": ap.icao,
            "iata": ap.iata,
            "name": ap.name,
            "city": ap.municipality,
        })

    # --- Airlines: search ICAO, IATA, name ---
    airline_results = db.query(Airline).filter(
        (func.lower(Airline.icao).like(like_q)) |
        (func.lower(Airline.iata).like(like_q)) |
        (func.lower(Airline.name).like(like_q))
    ).order_by(
        (func.lower(Airline.name) == lower_q).desc(),
        func.length(Airline.name).asc(),
        (func.lower(Airline.icao) == lower_q).desc(),
        (func.lower(Airline.iata) == lower_q).desc(),
    ).limit(5).all()

    airlines = []
    for al in airline_results:
        airlines.append({
            "icao": al.icao,
            "iata": al.iata,
            "name": al.name,
        })

    return {
        "flights": flights,
        "airports": airports,
        "airlines": airlines,
    }
