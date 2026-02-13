import json
import os
import sqlite3

from server.database import database
from server.environment import ENABLE_EXTERNAL_APIS, FR24_EMAIL, FR24_PASSWORD, DATA_PATH
from server.models import User
from server.routers.flights import get_flights
from server.auth.users import get_current_user
from server.internal.flightradar24 import FR24Client

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(
    prefix="/fr24",
    tags=["importing/exporting"],
    redirect_slashes=True
)

def _flight_label(flight) -> str:
    origin = flight.origin.icao if hasattr(flight.origin, 'icao') else flight.origin
    dest = flight.destination.icao if hasattr(flight.destination, 'icao') else flight.destination
    return f"{flight.date} {origin}->{dest}"

def _get_raw_airlines(flight_ids: list[int]) -> dict[int, str | None]:
    """Get the raw airline ICAO codes directly from the flights table,
    since get_flights() loses unmatched airline strings via the LEFT JOIN."""
    if not flight_ids:
        return {}
    placeholders = ",".join("?" * len(flight_ids))
    rows = database.execute_read_query(
        f"SELECT id, airline FROM flights WHERE id IN ({placeholders});",
        flight_ids
    )
    return {row[0]: row[1] for row in rows}

@router.post("/sync", status_code=200)
async def sync_to_fr24(user: User = Depends(get_current_user)):
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="External APIs are disabled.")

    if not FR24_EMAIL or not FR24_PASSWORD:
        raise HTTPException(status_code=400, detail="FR24 credentials are not configured.")

    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list

    synced_rows = database.execute_read_query(
        "SELECT flight_id FROM fr24_synced_flights WHERE flight_id IN "
        f"(SELECT id FROM flights WHERE username = ?);",
        [user.username]
    )
    synced_ids = {row[0] for row in synced_rows}
    unsynced = [f for f in flights if f.id not in synced_ids]

    # fetch raw airline ICAO codes so we don't lose unmatched airlines
    raw_airlines = _get_raw_airlines([f.id for f in unsynced])

    def event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def generate():
        # StreamingResponse runs in a worker thread, so we need our own
        # SQLite connection (the global one is bound to the main thread).
        db_path = os.path.join(DATA_PATH, "jetlog.db")
        conn = sqlite3.connect(db_path)

        if not unsynced:
            yield event({"type": "done", "synced": 0, "failed": 0, "total": 0})
            conn.close()
            return

        total = len(unsynced)
        yield event({"type": "start", "total": total})

        try:
            client = FR24Client(FR24_EMAIL, FR24_PASSWORD)
            client.login()
        except Exception as e:
            yield event({"type": "error", "message": f"FR24 login failed: {e}"})
            conn.close()
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
                conn.execute(
                    "INSERT INTO fr24_synced_flights (flight_id) VALUES (?);",
                    [flight.id]
                )
                conn.commit()
                synced += 1
                yield event({"type": "progress", "current": i + 1, "total": total,
                             "flight": label, "status": "ok"})
            except Exception as e:
                failed += 1
                yield event({"type": "progress", "current": i + 1, "total": total,
                             "flight": label, "status": "failed", "error": str(e)})

        conn.close()
        yield event({"type": "done", "synced": synced, "failed": failed, "total": total})

    return StreamingResponse(generate(), media_type="text/event-stream")
