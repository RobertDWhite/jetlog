import json
import datetime
import math
import os
import sqlite3

import pytz

from server.db.session import get_db, SessionLocal
from server.db.models import Flight, Airport, Airline as AirlineDB, AuditLog
from server.environment import ENABLE_EXTERNAL_APIS, DATA_PATH, FLIGHTERA_API_KEY
from server.models import AirlineModel, AirportModel, ClassType, CustomModel, FlightModel, AircraftSide, FlightPurpose, SeatType, User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from enum import Enum


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


router = APIRouter(
    prefix="/flights",
    tags=["flights"],
    redirect_slashes=True
)


class Order(str, Enum):
    ASCENDING = "ASC"
    DESCENDING = "DESC"


class Sort(str, Enum):
    DATE = "date"
    SEAT = "seat"
    AIRCRAFT_SIDE = "aircraft_side"
    TICKET_CLASS = "ticket_class"
    DURATION = "duration"
    DISTANCE = "distance"


async def check_flight_authorization(id: int, user: User, db: Session) -> None:
    flight = db.query(Flight).filter(Flight.id == id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")

    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can modify other users' flights")


# https://en.wikipedia.org/wiki/Haversine_formula
async def spherical_distance(origin: AirportModel | str, destination: AirportModel | str) -> int:
    from server.routers.airports import get_airport_from_icao

    # make sure we have object types
    if type(origin) == str:
        with SessionLocal() as db:
            origin = await get_airport_from_icao(origin, db)
    if type(destination) == str:
        with SessionLocal() as db:
            destination = await get_airport_from_icao(destination, db)

    assert type(origin) == AirportModel and type(destination) == AirportModel

    if not origin.latitude or not origin.longitude or not destination.latitude or not destination.longitude:
        return 0

    # convert to radian
    origin_lat = origin.latitude * math.pi / 180.0
    origin_lon = origin.longitude * math.pi / 180.0
    destination_lat = destination.latitude * math.pi / 180.0
    destination_lon = destination.longitude * math.pi / 180.0

    # get deltas
    delta_lat = origin_lat - destination_lat
    delta_lon = origin_lon - destination_lon

    # apply Haversine formulas
    hav_delta_lat = math.sin(delta_lat / 2) ** 2
    hav_delta_lon = math.sin(delta_lon / 2) ** 2

    hav_theta = hav_delta_lat + (hav_delta_lon * math.cos(origin_lat) * math.cos(destination_lat))

    earth_radius = 6371  # km
    distance = 2 * earth_radius * math.asin(math.sqrt(hav_theta))

    return round(distance)


def to_utc(dt: datetime.datetime, airport: str | AirportModel) -> datetime.datetime:
    if type(airport) != AirportModel:
        with SessionLocal() as db:
            ap = db.query(Airport).filter(Airport.icao == airport).first()
            tz_name = ap.timezone if ap else "UTC"
    else:
        tz_name = airport.timezone

    tz = pytz.timezone(tz_name)
    utc_dt = tz.localize(dt).astimezone(pytz.utc)

    return utc_dt


def duration(departure: datetime.datetime, arrival: datetime.datetime) -> int:
    if arrival.time() <= departure.time():
        arrival_date = arrival.date() + datetime.timedelta(days=1)
        arrival = arrival.replace(day=arrival_date.day)

    delta = arrival - departure
    delta_minutes = delta.seconds // 60
    return delta_minutes


@router.post("/many", status_code=201)
async def add_many_flights(flights: list[FlightModel], timezones: bool = True, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    creator_flight_id = -1
    for flight in flights:
        if flight.username != user.username and not user.is_admin:
            raise HTTPException(status_code=403, detail="Only admins can add flights for other users")

        flight_id = await add_flight(flight, timezones, user, db)
        if flight.username == user.username:
            creator_flight_id = flight_id

    return creator_flight_id


@router.post("/trip", status_code=201)
async def add_trip(flights: list[FlightModel], timezones: bool = True, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    if len(flights) < 1:
        raise HTTPException(status_code=400, detail="Trip must have at least one flight")

    flight_ids = []
    for flight in flights:
        flight_id = await add_flight(flight, timezones, user, db)
        flight_ids.append(flight_id)

    # Link flights via connection: flight N connects to flight N+1
    for i in range(len(flight_ids) - 1):
        db.query(Flight).filter(Flight.id == flight_ids[i]).update(
            {Flight.connection: flight_ids[i + 1]}
        )
    db.commit()

    return flight_ids[0]


@router.get("/check-duplicate", status_code=200)
async def check_duplicate(date: str, origin: str, destination: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    count = db.query(Flight).filter(
        Flight.date == date,
        func.upper(Flight.origin) == func.upper(origin),
        func.upper(Flight.destination) == func.upper(destination),
        Flight.username == user.username
    ).count()
    return {"duplicate": count > 0, "count": count}


@router.post("", status_code=201)
async def add_flight(flight: FlightModel, timezones: bool = True, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    # only admins may add flights for other users
    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can add flights for other users")

    if not (flight.date and flight.origin and flight.destination):
        raise HTTPException(status_code=404,
                            detail="Insufficient flight data. Date, Origin, and Destination are required")

    # if distance not given, calculate it
    if not flight.distance:
        flight.distance = await spherical_distance(flight.origin, flight.destination)

    # if duration not given, calculate it
    if not flight.duration and flight.departure_time and flight.arrival_time:
        departure_dt = datetime.datetime.strptime(f"{flight.date} {flight.departure_time}", "%Y-%m-%d %H:%M")
        arrival_dt = datetime.datetime.strptime(f"{flight.arrival_date if flight.arrival_date else flight.date} {flight.arrival_time}", "%Y-%m-%d %H:%M")

        if timezones:
            departure_dt = to_utc(departure_dt, flight.origin)
            arrival_dt = to_utc(arrival_dt, flight.destination)

        flight.duration = duration(departure_dt, arrival_dt)

    # Build the ORM object
    username_val = flight.username if flight.username else user.username

    # Extract ICAO strings from AirportModel/AirlineModel objects
    origin_val = flight.origin.icao if type(flight.origin) == AirportModel else flight.origin
    dest_val = flight.destination.icao if type(flight.destination) == AirportModel else flight.destination
    airline_val = None
    if flight.airline:
        airline_val = flight.airline.icao if type(flight.airline) == AirlineModel else flight.airline

    new_flight = Flight(
        username=username_val,
        date=flight.date.isoformat() if isinstance(flight.date, datetime.date) else flight.date,
        origin=origin_val,
        destination=dest_val,
        departure_time=flight.departure_time,
        arrival_time=flight.arrival_time,
        arrival_date=flight.arrival_date.isoformat() if isinstance(flight.arrival_date, datetime.date) else flight.arrival_date,
        seat=flight.seat.value if flight.seat else None,
        seat_number=flight.seat_number,
        aircraft_side=flight.aircraft_side.value if flight.aircraft_side else None,
        ticket_class=flight.ticket_class.value if flight.ticket_class else None,
        purpose=flight.purpose.value if flight.purpose else None,
        duration=flight.duration,
        distance=flight.distance,
        airplane=flight.airplane,
        airline=airline_val,
        tail_number=flight.tail_number,
        flight_number=flight.flight_number,
        notes=flight.notes,
        cost=flight.cost,
        currency=flight.currency,
        rating=flight.rating,
        connection=flight.connection,
    )

    db.add(new_flight)
    db.flush()  # Get the auto-generated id
    new_id = new_flight.id

    # Audit log
    audit = AuditLog(
        username=user.username,
        action="create",
        flight_id=new_id,
        details=f"{origin_val} -> {dest_val} on {flight.date}"
    )
    db.add(audit)
    db.commit()

    return new_id


class FlightPatchModel(CustomModel):
    date: datetime.date | None = None
    origin: AirportModel | str | None = None
    destination: AirportModel | str | None = None
    departure_time: str | None = None
    arrival_time: str | None = None
    arrival_date: datetime.date | None = None
    seat: SeatType | None = None
    aircraft_side: AircraftSide | None = None
    ticket_class: ClassType | None = None
    purpose: FlightPurpose | None = None
    duration: int | None = None
    distance: int | None = None
    airplane: str | None = None
    airline: AirlineModel | str | None = None
    tail_number: str | None = None
    flight_number: str | None = None
    notes: str | None = None
    rating: int | None = None
    connection: int | None = None


@router.patch("", status_code=200)
async def update_flight(id: int,
                        new_flight: FlightPatchModel,
                        timezones: bool = True,
                        user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)) -> int:
    await check_flight_authorization(id, user, db)

    if new_flight.empty():
        return id

    # if airports changed, update distance (unless specified)
    if new_flight.origin or new_flight.destination and not new_flight.distance:
        original_flight = await get_flights(id=id, db=db)
        assert type(original_flight) == FlightModel

        new_origin = new_flight.origin if new_flight.origin else original_flight.origin
        new_destination = new_flight.destination if new_flight.destination else original_flight.destination

        new_flight.distance = await spherical_distance(new_origin, new_destination)

    # if arrival / departure date or arrival date changed, update duration (unless specified)
    if not new_flight.duration:
        if new_flight.date or new_flight.departure_time or new_flight.arrival_date or new_flight.arrival_time:
            original_flight = await get_flights(id=id, db=db)
            assert type(original_flight) == FlightModel

            new_departure_date = new_flight.date if new_flight.date else original_flight.date
            new_departure_time = new_flight.departure_time if new_flight.departure_time else original_flight.departure_time
            new_arrival_date = new_flight.arrival_date if new_flight.arrival_date else original_flight.arrival_date
            new_arrival_time = new_flight.arrival_time if new_flight.arrival_time else original_flight.arrival_time

            if new_arrival_time and new_departure_time:
                new_departure = datetime.datetime.strptime(f"{new_departure_date} {new_departure_time}", "%Y-%m-%d %H:%M")
                new_arrival = datetime.datetime.strptime(f"{new_arrival_date if new_arrival_date else new_departure_date} {new_arrival_time}", "%Y-%m-%d %H:%M")

                if timezones:
                    new_departure = to_utc(new_departure, new_flight.origin if new_flight.origin else original_flight.origin)
                    new_arrival = to_utc(new_arrival, new_flight.destination if new_flight.destination else original_flight.destination)

                new_flight.duration = duration(new_departure, new_arrival)

    # Build update dict
    update_data = {}
    for attr in FlightPatchModel.get_attributes():
        value = getattr(new_flight, attr)
        if value is not None:
            # Convert types for DB storage
            if isinstance(value, AirportModel):
                value = value.icao
            elif isinstance(value, AirlineModel):
                value = value.icao
            elif isinstance(value, datetime.date):
                value = value.isoformat()
            elif hasattr(value, 'value'):  # Enum
                value = value.value
            update_data[attr] = value

    if update_data:
        db.query(Flight).filter(Flight.id == id).update(update_data)

    # Audit log
    changed = [attr for attr in FlightPatchModel.get_attributes() if getattr(new_flight, attr) is not None]
    audit = AuditLog(
        username=user.username,
        action="edit",
        flight_id=id,
        details=f"Updated: {', '.join(changed)}"
    )
    db.add(audit)
    db.commit()

    return id


@router.delete("", status_code=200)
async def delete_flight(id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    await check_flight_authorization(id, user, db)

    db.query(Flight).filter(Flight.id == id).delete()

    audit = AuditLog(
        username=user.username,
        action="delete",
        flight_id=id,
        details=None
    )
    db.add(audit)
    db.commit()

    return id


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_flights(ids: list[int], user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    for flight_id in ids:
        await check_flight_authorization(flight_id, user, db)
    for flight_id in ids:
        db.query(Flight).filter(Flight.id == flight_id).delete()

    audit = AuditLog(
        username=user.username,
        action="bulk-delete",
        flight_id=None,
        details=f"Deleted {len(ids)} flights: {ids}"
    )
    db.add(audit)
    db.commit()

    return len(ids)


class BulkEditPayload(CustomModel):
    ids: list[int]
    ticket_class: ClassType | None = None
    purpose: FlightPurpose | None = None
    seat: SeatType | None = None
    aircraft_side: AircraftSide | None = None
    airline: str | None = None


@router.post("/bulk-edit", status_code=200)
async def bulk_edit_flights(payload: BulkEditPayload, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> int:
    for flight_id in payload.ids:
        await check_flight_authorization(flight_id, user, db)

    update_data = {}
    set_parts_desc = []
    for field in ["ticket_class", "purpose", "seat", "aircraft_side", "airline"]:
        val = getattr(payload, field)
        if val is not None:
            update_data[field] = val.value if hasattr(val, 'value') else val
            set_parts_desc.append(f"{field} = ?")

    if not update_data:
        return 0

    db.query(Flight).filter(Flight.id.in_(payload.ids)).update(update_data, synchronize_session='fetch')

    audit = AuditLog(
        username=user.username,
        action="bulk-edit",
        flight_id=None,
        details=f"Edited {len(payload.ids)} flights: {', '.join(set_parts_desc)}"
    )
    db.add(audit)
    db.commit()

    return len(payload.ids)


@router.get("/audit-log", status_code=200)
async def get_audit_log(limit: int = 50, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    from server.db.models import AuditLog as AuditLogModel
    results = db.query(AuditLogModel).filter(
        AuditLogModel.username == user.username
    ).order_by(AuditLogModel.timestamp.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "timestamp": str(r.timestamp) if r.timestamp else None,
            "username": r.username,
            "action": r.action,
            "flightId": r.flight_id,
            "details": r.details,
        }
        for r in results
    ]


@router.post("/{flight_id}/photo", status_code=201)
async def upload_photo(flight_id: int, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    await check_flight_authorization(flight_id, user, db)

    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, and GIF images are allowed")

    photo_dir = os.path.join(DATA_PATH, "photos", str(flight_id))
    os.makedirs(photo_dir, exist_ok=True)

    # Remove existing photo if any
    for existing in os.listdir(photo_dir):
        os.remove(os.path.join(photo_dir, existing))

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    photo_path = os.path.join(photo_dir, f"photo.{ext}")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    with open(photo_path, "wb") as f:
        f.write(contents)

    return {"path": f"/flights/{flight_id}/photo"}


@router.get("/photos/all", status_code=200)
async def get_all_photos(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """List all flight IDs that have photos for the current user."""
    photo_base = os.path.join(DATA_PATH, "photos")
    if not os.path.isdir(photo_base):
        return []

    flight_ids = []
    for dirname in os.listdir(photo_base):
        try:
            fid = int(dirname)
            photo_dir = os.path.join(photo_base, dirname)
            if os.listdir(photo_dir):
                flight_ids.append(fid)
        except ValueError:
            continue

    if not flight_ids:
        return []

    # Filter to only this user's flights and get basic info
    results = db.query(Flight.id, Flight.date, Flight.origin, Flight.destination).filter(
        Flight.id.in_(flight_ids),
        Flight.username == user.username
    ).order_by(Flight.date.desc()).all()

    return [{"id": r[0], "date": r[1], "origin": r[2], "destination": r[3]} for r in results]


@router.get("/{flight_id}/photo", status_code=200)
async def get_photo(flight_id: int):
    photo_dir = os.path.join(DATA_PATH, "photos", str(flight_id))
    if not os.path.isdir(photo_dir):
        raise HTTPException(status_code=404, detail="No photo found")

    files = os.listdir(photo_dir)
    if not files:
        raise HTTPException(status_code=404, detail="No photo found")

    photo_path = os.path.join(photo_dir, files[0])
    return FileResponse(photo_path)


@router.delete("/{flight_id}/photo", status_code=200)
async def delete_photo(flight_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    await check_flight_authorization(flight_id, user, db)

    photo_dir = os.path.join(DATA_PATH, "photos", str(flight_id))
    if os.path.isdir(photo_dir):
        for f in os.listdir(photo_dir):
            os.remove(os.path.join(photo_dir, f))
        os.rmdir(photo_dir)

    return {"status": "ok"}


@router.get("", status_code=200)
async def get_flights(id: int | None = None,
                      metric: bool = True,
                      limit: int = 50,
                      offset: int = 0,
                      order: Order = Order.DESCENDING,
                      sort: Sort = Sort.DATE,
                      start: datetime.date | None = None,
                      end: datetime.date | None = None,
                      origin: str | None = None,
                      destination: str | None = None,
                      username: str | None = None,
                      user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)) -> list[FlightModel] | FlightModel:

    username_filter = None if id else username if username else user.username

    # Use raw SQL for this complex join query to preserve exact behavior
    if sort == Sort.DATE:
        sort_clause = f"ORDER BY f.date {order.value}, f.departure_time {order.value}"
    else:
        sort_clause = f"ORDER BY f.{sort.value} {order.value}"

    query = f"""
        SELECT
            f.*,
            o.*,
            d.*,
            a.*
        FROM flights f
        JOIN airports o ON UPPER(f.origin) = o.icao
        JOIN airports d ON UPPER(f.destination) = d.icao
        LEFT JOIN airlines a ON UPPER(f.airline) = a.icao
        WHERE (:id IS NULL OR f.id = :id)
        AND   (:username IS NULL OR f.username = :username)
        AND   (:start IS NULL OR JULIANDAY(date) >= JULIANDAY(:start))
        AND   (:end IS NULL OR JULIANDAY(date) <= JULIANDAY(:end))
        AND   (:origin IS NULL OR f.origin = UPPER(:origin))
        AND   (:destination IS NULL OR f.destination = UPPER(:destination))
        {sort_clause}
        LIMIT :limit
        OFFSET :offset;"""

    params = {
        "id": id,
        "username": username_filter,
        "start": str(start) if start else None,
        "end": str(end) if end else None,
        "origin": origin,
        "destination": destination,
        "limit": limit,
        "offset": offset,
    }

    res = db.execute(text(query), params).fetchall()

    # get rid of origin, destination, and airline ICAOs for proper conversion
    # after this, each flight_db is in the format:
    # [id, username, date, departure_time, ..., AirportModel, AirportModel, AirlineModel]
    res = [db_flight[:3] + db_flight[5:15] + db_flight[16:] for db_flight in res]

    flights = []

    for db_flight in res:
        begin = len(FlightModel.get_attributes()) - 3
        airport_length = len(AirportModel.get_attributes())
        airline_length = len(AirlineModel.get_attributes())

        db_origin = db_flight[begin:begin + airport_length]
        db_destination = db_flight[begin + airport_length:begin + 2 * airport_length]
        db_airline = db_flight[begin + 2 * airport_length:begin + 2 * airport_length + airline_length]

        origin_obj = AirportModel.from_database(db_origin)
        destination_obj = AirportModel.from_database(db_destination)
        airline_obj = AirlineModel.from_database(db_airline) if db_airline[0] != None else None

        flight = FlightModel.from_database(db_flight, {"origin": origin_obj,
                                                        "destination": destination_obj,
                                                        "airline": airline_obj})

        if not metric and flight.distance:
            flight.distance = round(flight.distance * 0.6213711922)

        flights.append(flight)

    if id and not flights:
        raise HTTPException(status_code=404, detail=f"Flight not found.")

    if id:
        return FlightModel.model_validate(flights[0])
    return [FlightModel.model_validate(flight) for flight in flights]


@router.post("/connections", status_code=200)
async def compute_connections(user: User = Depends(get_current_user)):
    username = user.username

    def generate():
        yield _sse_event({"type": "start", "total": 1})

        db_path = os.path.join(DATA_PATH, "jetlog.db")
        conn = sqlite3.connect(db_path)

        try:
            cur = conn.execute("""
                WITH plausible AS (
                    SELECT f.id  AS flight_id, c.id AS conn_id
                    FROM flights AS f
                    JOIN flights AS c ON
                        c.origin = f.destination
                        AND c.destination != f.origin
                        AND JULIANDAY(c.date) BETWEEN JULIANDAY(f.date) - 1 AND JULIANDAY(f.date) + 2
                        AND c.username = ?
                    WHERE f.username = ? AND f.connection IS NULL
                ),
                one_conn AS (
                    SELECT flight_id, MAX(conn_id) AS conn_id
                    FROM plausible
                    GROUP BY flight_id
                    HAVING COUNT(*) = 1
                ),
                multi_conn AS (
                    SELECT flight_id FROM plausible
                    GROUP BY flight_id
                    HAVING COUNT(*) > 1
                )

                UPDATE flights SET connection = (
                    SELECT conn_id
                    FROM one_conn
                    WHERE one_conn.flight_id = flights.id
                )
                WHERE id IN (SELECT flight_id FROM one_conn)
                RETURNING
                    ( SELECT COUNT(*) FROM multi_conn ) AS amount_skipped,
                    ( SELECT COUNT(*) FROM one_conn ) AS amount_updated;""",
                [username, username])
            res = cur.fetchone()
            conn.commit()

            if not res:
                res = (0, 0)

            updated, skipped = res[1], res[0]
            yield _sse_event({"type": "progress", "current": 1, "total": 1,
                              "item": f"{updated} connections found, {skipped} ambiguous",
                              "status": "ok"})
            yield _sse_event({"type": "done", "updated": updated, "skipped": skipped, "total": 1})
        except Exception as e:
            yield _sse_event({"type": "progress", "current": 1, "total": 1,
                              "item": str(e), "status": "failed"})
            yield _sse_event({"type": "done", "updated": 0, "skipped": 0, "total": 1})
        finally:
            conn.close()

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/airlines_from_callsigns", status_code=200)
async def fetch_airlines_from_callsigns(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="This endpoint relies on the use of an external API, which you have opted out of.")

    import requests as req

    results = db.query(Flight.flight_number, func.count(Flight.id)).filter(
        Flight.flight_number.isnot(None),
        Flight.airline.is_(None),
        Flight.username == user.username
    ).group_by(Flight.flight_number).all()

    callsigns = list(results)
    username = user.username

    def generate():
        db_path = os.path.join(DATA_PATH, "jetlog.db")
        conn = sqlite3.connect(db_path)

        total = len(callsigns)
        if total == 0:
            yield _sse_event({"type": "done", "updated": 0, "skipped": 0, "total": 0})
            conn.close()
            return

        yield _sse_event({"type": "start", "total": total})

        updates = 0
        skips = 0

        for i, (callsign, amount) in enumerate(callsigns):
            try:
                adsbdb_res = req.get(f"https://api.adsbdb.com/v0/callsign/{callsign}")

                if adsbdb_res.status_code != 200:
                    skips += amount
                    yield _sse_event({"type": "progress", "current": i + 1, "total": total,
                                      "item": f"{callsign} ({amount} flights)", "status": "failed",
                                      "error": f"API returned {adsbdb_res.status_code}"})
                    continue

                data = adsbdb_res.json()
                airline_icao = data["response"]["flightroute"]["airline"]["icao"]

                conn.execute("""UPDATE flights
                               SET airline = ?
                               WHERE flight_number = ? AND airline IS NULL AND username = ?;""",
                             [airline_icao, callsign, username])
                conn.commit()
                updates += amount
                yield _sse_event({"type": "progress", "current": i + 1, "total": total,
                                  "item": f"{callsign} -> {airline_icao} ({amount} flights)", "status": "ok"})
            except Exception as e:
                skips += amount
                yield _sse_event({"type": "progress", "current": i + 1, "total": total,
                                  "item": f"{callsign} ({amount} flights)", "status": "failed",
                                  "error": str(e)})

        conn.close()
        yield _sse_event({"type": "done", "updated": updates, "skipped": skips, "total": total})

    return StreamingResponse(generate(), media_type="text/event-stream")


def _apply_enrichment(flight: dict, aircraft_text, registration, real_dep, real_arr,
                      origin_tz_offset, dest_tz_offset, group_detail: list) -> tuple[list, list]:
    """Build SET clause and values for NULL fields that have data to backfill."""
    set_parts = []
    values = []

    if flight["airplane"] is None and aircraft_text:
        set_parts.append("airplane = ?")
        values.append(aircraft_text)
        if aircraft_text not in group_detail:
            group_detail.append(aircraft_text)

    if flight["tail_number"] is None and registration:
        set_parts.append("tail_number = ?")
        values.append(registration)
        if registration not in group_detail:
            group_detail.append(registration)

    if flight["departure_time"] is None and real_dep:
        if isinstance(real_dep, (int, float)):
            local_dep = datetime.datetime.utcfromtimestamp(real_dep + origin_tz_offset)
            set_parts.append("departure_time = ?")
            values.append(local_dep.strftime("%H:%M"))
        elif isinstance(real_dep, str) and ":" in real_dep:
            set_parts.append("departure_time = ?")
            values.append(real_dep[:5])  # HH:MM

    if flight["arrival_time"] is None and real_arr:
        if isinstance(real_arr, (int, float)):
            local_arr = datetime.datetime.utcfromtimestamp(real_arr + dest_tz_offset)
            set_parts.append("arrival_time = ?")
            values.append(local_arr.strftime("%H:%M"))
        elif isinstance(real_arr, str) and ":" in real_arr:
            set_parts.append("arrival_time = ?")
            values.append(real_arr[:5])

    if flight["duration"] is None and real_dep and real_arr:
        if isinstance(real_dep, (int, float)) and isinstance(real_arr, (int, float)):
            dur_minutes = (real_arr - real_dep) // 60
            if dur_minutes > 0:
                set_parts.append("duration = ?")
                values.append(dur_minutes)

    return set_parts, values


@router.post("/enrich", status_code=200)
async def enrich_flight_details(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Backfill missing flight details from FR24 (recent) + Flightera (older)."""
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="This endpoint relies on the use of an external API, which you have opted out of.")

    import time
    from collections import defaultdict
    from server.internal.flightradar24 import lookup_flight_history, lookup_flightera

    rows = db.query(
        Flight.id, Flight.flight_number, Flight.date, Flight.airplane,
        Flight.tail_number, Flight.departure_time, Flight.arrival_time, Flight.duration
    ).filter(
        Flight.flight_number.isnot(None),
        Flight.username == user.username,
        (Flight.airplane.is_(None)) | (Flight.tail_number.is_(None)) |
        (Flight.departure_time.is_(None)) | (Flight.arrival_time.is_(None)) |
        (Flight.duration.is_(None))
    ).all()

    groups: dict[str, list] = defaultdict(list)
    for row in rows:
        fid, fn, date_str, airplane, tail, dep_time, arr_time, dur = row
        groups[fn].append({
            "id": fid, "flight_number": fn, "date": date_str,
            "airplane": airplane, "tail_number": tail,
            "departure_time": dep_time, "arrival_time": arr_time,
            "duration": dur,
        })

    group_list = list(groups.items())
    username = user.username
    has_flightera = bool(FLIGHTERA_API_KEY)

    def generate():
        db_path = os.path.join(DATA_PATH, "jetlog.db")
        conn = sqlite3.connect(db_path)

        total = len(group_list)
        if total == 0:
            yield _sse_event({"type": "done", "updated": 0, "skipped": 0, "total": 0})
            conn.close()
            return

        yield _sse_event({"type": "start", "total": total})

        updates = 0
        skips = 0

        for i, (flight_number, flight_list) in enumerate(group_list):
            # Step 1: Try FR24 (free, recent ~2 weeks)
            fr24_date_map: dict[str, dict] = {}
            try:
                history = lookup_flight_history(flight_number)
                for entry in history:
                    sched_dep = (entry.get("time", {}).get("scheduled", {}).get("departure")
                                 or entry.get("time", {}).get("real", {}).get("departure"))
                    if sched_dep:
                        entry_date = datetime.datetime.utcfromtimestamp(sched_dep).strftime("%Y-%m-%d")
                        fr24_date_map[entry_date] = entry
            except Exception:
                pass  # FR24 failed, will try Flightera

            group_updated = 0
            group_detail = []
            flightera_pending = []  # flights not found in FR24

            for flight in flight_list:
                match = fr24_date_map.get(flight["date"])
                if match:
                    # FR24 match -- extract fields
                    aircraft_text = (match.get("aircraft", {}).get("model", {}).get("text") or None)
                    registration = (match.get("aircraft", {}).get("registration") or None)
                    real_dep = match.get("time", {}).get("real", {}).get("departure")
                    real_arr = match.get("time", {}).get("real", {}).get("arrival")
                    origin_tz = match.get("airport", {}).get("origin", {}).get("timezone", {}).get("offset", 0)
                    dest_tz = match.get("airport", {}).get("destination", {}).get("timezone", {}).get("offset", 0)

                    set_parts, values = _apply_enrichment(
                        flight, aircraft_text, registration, real_dep, real_arr,
                        origin_tz, dest_tz, group_detail)

                    if set_parts:
                        values.append(flight["id"])
                        conn.execute(f"UPDATE flights SET {', '.join(set_parts)} WHERE id = ?;", values)
                        conn.commit()
                        updates += 1
                        group_updated += 1
                    else:
                        skips += 1
                else:
                    flightera_pending.append(flight)

            # Step 2: Flightera fallback for flights not in FR24
            if flightera_pending and has_flightera:
                for flight in flightera_pending:
                    try:
                        result = lookup_flightera(flight["flight_number"], flight["date"], FLIGHTERA_API_KEY)
                    except Exception:
                        result = None

                    if not result:
                        skips += 1
                        continue

                    set_parts, values = _apply_enrichment(
                        flight, result["aircraft_text"], result["registration"],
                        result["real_departure"], result["real_arrival"],
                        result["origin_tz_offset"], result["dest_tz_offset"],
                        group_detail)

                    if set_parts:
                        values.append(flight["id"])
                        conn.execute(f"UPDATE flights SET {', '.join(set_parts)} WHERE id = ?;", values)
                        conn.commit()
                        updates += 1
                        group_updated += 1
                    else:
                        skips += 1

                    time.sleep(1)  # rate limit Flightera
            elif flightera_pending:
                skips += len(flightera_pending)

            detail = ", ".join(group_detail[:2]) if group_detail else "no match"
            source = "FR24" if not flightera_pending else ("Flightera" if has_flightera else "FR24 only")
            status = "ok" if group_updated > 0 else "failed"
            yield _sse_event({"type": "progress", "current": i + 1, "total": total,
                              "item": f"{flight_number} — {group_updated}/{len(flight_list)} enriched via {source} ({detail})",
                              "status": status})

            time.sleep(2)  # respect FR24 rate limits

        conn.close()
        yield _sse_event({"type": "done", "updated": updates, "skipped": skips, "total": total})

    return StreamingResponse(generate(), media_type="text/event-stream")
