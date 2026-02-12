from server.database import database
from server.environment import ENABLE_EXTERNAL_APIS, FR24_EMAIL, FR24_PASSWORD
from server.models import User
from server.routers.flights import get_flights
from server.auth.users import get_current_user
from server.internal.flightradar24 import FR24Client

from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(
    prefix="/fr24",
    tags=["importing/exporting"],
    redirect_slashes=True
)

@router.post("/sync", status_code=200)
async def sync_to_fr24(user: User = Depends(get_current_user)) -> dict:
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="External APIs are disabled.")

    if not FR24_EMAIL or not FR24_PASSWORD:
        raise HTTPException(status_code=400, detail="FR24 credentials are not configured.")

    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list

    # get already-synced flight IDs
    synced_rows = database.execute_read_query(
        "SELECT flight_id FROM fr24_synced_flights WHERE flight_id IN "
        f"(SELECT id FROM flights WHERE username = ?);",
        [user.username]
    )
    synced_ids = {row[0] for row in synced_rows}

    unsynced = [f for f in flights if f.id not in synced_ids]

    if not unsynced:
        return {"synced": 0, "failed": 0, "errors": []}

    client = FR24Client(FR24_EMAIL, FR24_PASSWORD)
    try:
        client.login()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FR24 login failed: {e}")

    synced = 0
    failed = 0
    errors = []

    for flight in unsynced:
        try:
            client.add_flight(flight)
            database.execute_query(
                "INSERT INTO fr24_synced_flights (flight_id) VALUES (?);",
                [flight.id]
            )
            synced += 1
        except Exception as e:
            failed += 1
            errors.append(f"Flight {flight.id} ({flight.origin.icao if hasattr(flight.origin, 'icao') else flight.origin}"
                          f" -> {flight.destination.icao if hasattr(flight.destination, 'icao') else flight.destination}): {e}")

    return {"synced": synced, "failed": failed, "errors": errors}
