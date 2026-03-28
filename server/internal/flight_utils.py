from server.db.session import SessionLocal
from server.db.models import Flight
from server.models import FlightModel

def flight_already_exists(flight: FlightModel, username: str) -> bool:
    with SessionLocal() as session:
        result = session.query(Flight).filter(
            Flight.username == username,
            Flight.date == str(flight.date),
            Flight.origin == str(flight.origin),
            Flight.destination == str(flight.destination),
            Flight.flight_number == flight.flight_number,
        ).first()
        return result is not None
