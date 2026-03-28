import json

from server.db.session import get_db, SessionLocal
from server.db.models import Flight, FR24SyncedFlight
from server.environment import ENABLE_EXTERNAL_APIS, FR24_EMAIL, FR24_PASSWORD
from server.models import User
from server.routers.flights import get_flights
from server.auth.users import get_current_user
from server.internal.flightradar24 import FR24Client

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

router = APIRouter(
    prefix="/fr24",
    tags=["importing/exporting"],
    redirect_slashes=True
)

def _flight_label(flight) -> str:
    origin = flight.origin.icao if hasattr(flight.origin, 'icao') else flight.origin
    dest = flight.destination.icao if hasattr(flight.destination, 'icao') else flight.destination
    return f"{flight.date} {origin}->{dest}"

def _get_raw_airlines(flight_ids: list[int], db: Session) -> dict[int, str | None]:
    """Get the raw airline ICAO codes directly from the flights table,
    since get_flights() loses unmatched airline strings via the LEFT JOIN."""
    if not flight_ids:
        return {}
    results = db.query(Flight.id, Flight.airline).filter(
        Flight.id.in_(flight_ids)
    ).all()
    return {row[0]: row[1] for row in results}

@router.post("/sync", status_code=200)
async def sync_to_fr24(user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="External APIs are disabled.")

    if not FR24_EMAIL or not FR24_PASSWORD:
        raise HTTPException(status_code=400, detail="FR24 credentials are not configured.")

    flights = await get_flights(limit=-1, user=user, db=db)
    assert type(flights) == list

    synced_rows = db.query(FR24SyncedFlight.flight_id).join(
        Flight, FR24SyncedFlight.flight_id == Flight.id
    ).filter(
        Flight.username == user.username
    ).all()
    synced_ids = {row[0] for row in synced_rows}
    unsynced = [f for f in flights if f.id not in synced_ids]

    # fetch raw airline ICAO codes so we don't lose unmatched airlines
    raw_airlines = _get_raw_airlines([f.id for f in unsynced], db)

    def event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def generate():
        # StreamingResponse runs in a worker thread, so we need our own session.
        session = SessionLocal()

        if not unsynced:
            yield event({"type": "done", "synced": 0, "failed": 0, "total": 0})
            session.close()
            return

        total = len(unsynced)
        yield event({"type": "start", "total": total})

        try:
            client = FR24Client(FR24_EMAIL, FR24_PASSWORD)
            client.login()
        except Exception as e:
            yield event({"type": "error", "message": f"FR24 login failed: {e}"})
            session.close()
            return

        yield event({"type": "login", "message": "Logged in to FlightRadar24"})

        synced = 0
        failed = 0

        for i, flight in enumerate(unsynced):
            label = _flight_label(flight)
            airline_override = None
            if flight.airline is None and raw_airlines.get(flight.id):
                airline_override = raw_airlines[flight.id]
            try:
                client.add_flight(flight, airline_override=airline_override)
                sync_record = FR24SyncedFlight(flight_id=flight.id)
                session.add(sync_record)
                session.commit()
                synced += 1
                yield event({"type": "progress", "current": i + 1, "total": total,
                             "flight": label, "status": "ok"})
            except Exception as e:
                session.rollback()
                failed += 1
                yield event({"type": "progress", "current": i + 1, "total": total,
                             "flight": label, "status": "failed", "error": str(e)})

        session.close()
        yield event({"type": "done", "synced": synced, "failed": failed, "total": total})

    return StreamingResponse(generate(), media_type="text/event-stream")
