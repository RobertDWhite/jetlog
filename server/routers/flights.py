import json
import datetime
import math
import os
import sqlite3

import pytz

from server.database import database
from server.environment import ENABLE_EXTERNAL_APIS, DATA_PATH, FLIGHTERA_API_KEY
from server.models import AirlineModel, AirportModel, ClassType, CustomModel, FlightModel, AircraftSide, FlightPurpose, SeatType, User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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

async def check_flight_authorization(id: int, user: User) -> None:
    res = database.execute_read_query(f"SELECT username FROM flights WHERE id = ?;", [id])
    flight_username = res[0][0]

    if flight_username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can modify other users' flights")

# https://en.wikipedia.org/wiki/Haversine_formula
async def spherical_distance(origin: AirportModel|str, destination: AirportModel|str) -> int:
    from server.routers.airports import get_airport_from_icao

    # make sure we have object types
    if type(origin) == str:
        origin = await get_airport_from_icao(origin)
    if type(destination) == str:
        destination = await get_airport_from_icao(destination)

    assert type(origin) == AirportModel and type(destination) == AirportModel

    if not origin.latitude or not origin.longitude or not destination.latitude or not destination.longitude:
        return 0

    #convert to radian
    origin_lat = origin.latitude * math.pi / 180.0;
    origin_lon = origin.longitude * math.pi / 180.0;
    destination_lat = destination.latitude * math.pi / 180.0;
    destination_lon = destination.longitude * math.pi / 180.0;

    # get deltas
    delta_lat = origin_lat - destination_lat;
    delta_lon = origin_lon - destination_lon;

    # apply Haversine formulas
    hav_delta_lat = math.sin(delta_lat / 2) ** 2;
    hav_delta_lon = math.sin(delta_lon / 2) ** 2;

    hav_theta = hav_delta_lat + (hav_delta_lon * math.cos(origin_lat) * math.cos(destination_lat))

    earth_radius = 6371; # km
    distance = 2 * earth_radius * math.asin(math.sqrt(hav_theta));

    return round(distance);

def to_utc(dt: datetime.datetime, airport: str|AirportModel) -> datetime.datetime:
    if type(airport) != AirportModel:
        tz_name = database.execute_read_query("SELECT timezone FROM airports WHERE icao = ?;", [airport])[0][0]
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
async def add_many_flights(flights: list[FlightModel], timezones: bool = True, user: User = Depends(get_current_user)) -> int:
    creator_flight_id = -1
    for flight in flights:
        if flight.username != user.username and not user.is_admin:
            raise HTTPException(status_code=403, detail="Only admins can add flights for other users")

        flight_id = await add_flight(flight, timezones, user)
        if flight.username == user.username:
            creator_flight_id = flight_id

    return creator_flight_id

@router.post("", status_code=201)
async def add_flight(flight: FlightModel, timezones: bool = True, user: User = Depends(get_current_user)) -> int:
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
        # create datetime objects
        departure = datetime.datetime.strptime(f"{flight.date} {flight.departure_time}", "%Y-%m-%d %H:%M")
        arrival = datetime.datetime.strptime(f"{flight.arrival_date if flight.arrival_date else flight.date} {flight.arrival_time}", "%Y-%m-%d %H:%M")

        # if using timezones, convert to UTC
        if timezones:
            departure = to_utc(departure, flight.origin)
            arrival = to_utc(arrival, flight.destination)

        flight.duration = duration(departure, arrival)

    columns = FlightModel.get_attributes(ignore=["id"])

    query = "INSERT INTO flights ("
    for attr in columns:
        query += f"{attr},"
    query = query[:-1]
    query += ") VALUES (" + ('?,' * len(columns))
    query = query[:-1]
    query += ") RETURNING id;"


    explicit = {"username": user.username} if not flight.username else {}
    values = flight.get_values(ignore=["id"], explicit=explicit)

    new_id = database.execute_query(query, values)[0]
    return new_id

class FlightPatchModel(CustomModel):
    date:             datetime.date|None = None
    origin:           AirportModel|str|None = None
    destination:      AirportModel|str|None = None
    departure_time:   str|None = None
    arrival_time:     str|None = None
    arrival_date:     datetime.date|None = None
    seat:             SeatType|None = None
    aircraft_side:    AircraftSide|None = None
    ticket_class:     ClassType|None = None
    purpose:          FlightPurpose|None = None
    duration:         int|None = None
    distance:         int|None = None
    airplane:         str|None = None
    airline:          AirlineModel|str|None = None
    tail_number:      str|None = None
    flight_number:    str|None = None
    notes:            str|None = None
    connection:       int|None = None

@router.patch("", status_code=200)
async def update_flight(id: int,
                        new_flight: FlightPatchModel,
                        timezones: bool = True,
                        user: User = Depends(get_current_user)) -> int:
    await check_flight_authorization(id, user)

    if new_flight.empty():
        return id

    # if airports changed, update distance (unless specified)
    if new_flight.origin or new_flight.destination and not new_flight.distance:
        # first must have both airports
        original_flight = await get_flights(id=id)
        assert type(original_flight) == FlightModel

        new_origin = new_flight.origin if new_flight.origin else original_flight.origin
        new_destination = new_flight.destination if new_flight.destination else original_flight.destination

        new_flight.distance = await spherical_distance(new_origin, new_destination)

    # if arrival / departure date or arrival date changed, update duration (unless specified)
    if not new_flight.duration:
        if new_flight.date or new_flight.departure_time or new_flight.arrival_date or new_flight.arrival_time:
            original_flight = await get_flights(id=id)
            assert type(original_flight) == FlightModel

            new_departure_date = new_flight.date if new_flight.date else original_flight.date
            new_departure_time = new_flight.departure_time if new_flight.departure_time else original_flight.departure_time
            new_arrival_date = new_flight.arrival_date if new_flight.arrival_date else original_flight.arrival_date
            new_arrival_time = new_flight.arrival_time if new_flight.arrival_time else original_flight.arrival_time

            # if arrival or departure times still not available, skip
            if new_arrival_time and new_departure_time:
                # create datetime objects
                new_departure = datetime.datetime.strptime(f"{new_departure_date} {new_departure_time}", "%Y-%m-%d %H:%M")
                new_arrival = datetime.datetime.strptime(f"{new_arrival_date if new_arrival_date else new_departure_date} {new_arrival_time}", "%Y-%m-%d %H:%M")

                # if using timezones, convert to UTC
                if timezones:
                    new_departure = to_utc(new_departure, new_flight.origin if new_flight.origin else original_flight.origin)
                    new_arrival = to_utc(new_arrival, new_flight.destination if new_flight.destination else original_flight.destination)

                new_flight.duration = duration(new_departure, new_arrival)

    query = "UPDATE flights SET "

    for attr in FlightPatchModel.get_attributes():
        value = getattr(new_flight, attr)
        if value:
            query += f"{attr}=?," if value else ""

    if query[-1] == ',':
        query = query[:-1]

    query += f" WHERE id = {str(id)} RETURNING id;"

    values = [value for value in new_flight.get_values() if value is not None]

    new_id = database.execute_query(query, values)[0]
    return new_id

@router.delete("", status_code=200)
async def delete_flight(id: int, user: User = Depends(get_current_user)) -> int:
    await check_flight_authorization(id, user)

    deleted_id = database.execute_query("DELETE FROM flights WHERE id = ? RETURNING id;", [id])[0]
    return deleted_id

@router.get("", status_code=200)
async def get_flights(id: int|None = None,
                      metric: bool = True,
                      limit: int = 50,
                      offset: int = 0,
                      order: Order = Order.DESCENDING,
                      sort: Sort = Sort.DATE,
                      start: datetime.date|None = None,
                      end: datetime.date|None = None,
                      origin: str|None = None,
                      destination: str|None = None,
                      username: str|None = None,
                      user: User = Depends(get_current_user)) -> list[FlightModel]|FlightModel:

    username_filter = None if id else username if username else user.username

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
        WHERE (? IS NULL OR f.id = ?)
        AND   (? IS NULL OR f.username = ?)
        AND   (? IS NULL OR JULIANDAY(date) >= JULIANDAY(?))
        AND   (? IS NULL OR JULIANDAY(date) <= JULIANDAY(?))
        AND   (? IS NULL OR f.origin = UPPER(?))
        AND   (? IS NULL OR f.destination = UPPER(?))
        {sort_clause}
        LIMIT {limit}
        OFFSET {offset};"""

    values = []
    for value in [id, username_filter, start, end, origin, destination]:
        values.append(value)
        values.append(value)

    res = database.execute_read_query(query, values);

    # get rid of origin, destination, and airline ICAOs for proper conversion
    # after this, each flight_db is in the format:
    # [id, username, date, departure_time, ..., AirportModel, AirportModel, AirlineModel]
    res = [ db_flight[:3] + db_flight[5:15] + db_flight[16:] for db_flight in res ]

    flights = []

    for db_flight in res:
        begin = len(FlightModel.get_attributes()) - 3
        airport_length = len(AirportModel.get_attributes())
        airline_length = len(AirlineModel.get_attributes())

        db_origin = db_flight[begin:begin + airport_length]
        db_destination = db_flight[begin + airport_length:begin + 2*airport_length]
        db_airline = db_flight[begin + 2*airport_length:begin + 2*airport_length + airline_length]

        origin = AirportModel.from_database(db_origin)
        destination = AirportModel.from_database(db_destination)
        airline = AirlineModel.from_database(db_airline) if db_airline[0] != None else None

        flight = FlightModel.from_database(db_flight, { "origin": origin,
                                                        "destination": destination,
                                                        "airline": airline } )

        if not metric and flight.distance:
            flight.distance = round(flight.distance * 0.6213711922)

        flights.append(flight)

    if id and not flights:
        raise HTTPException(status_code=404, detail=f"Flight not found.")

    if id:
        return FlightModel.model_validate(flights[0])
    return [ FlightModel.model_validate(flight) for flight in flights ]

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
async def fetch_airlines_from_callsigns(user: User = Depends(get_current_user)):
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="This endpoint relies on the use of an external API, which you have opted out of.")

    import requests as req

    res = database.execute_read_query("""SELECT flight_number, COUNT(*)
                                         FROM flights
                                         WHERE flight_number IS NOT NULL AND airline IS NULL AND username = ?
                                         GROUP BY flight_number;""", [user.username])
    callsigns = list(res)
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
async def enrich_flight_details(user: User = Depends(get_current_user)):
    """Backfill missing flight details from FR24 (recent) + Flightera (older)."""
    if not ENABLE_EXTERNAL_APIS:
        raise HTTPException(status_code=400, detail="This endpoint relies on the use of an external API, which you have opted out of.")

    import time
    from collections import defaultdict
    from server.internal.flightradar24 import lookup_flight_history, lookup_flightera

    rows = database.execute_read_query(
        """SELECT id, flight_number, date, airplane, tail_number,
                  departure_time, arrival_time, duration
           FROM flights
           WHERE flight_number IS NOT NULL
             AND username = ?
             AND (airplane IS NULL OR tail_number IS NULL
                  OR departure_time IS NULL OR arrival_time IS NULL
                  OR duration IS NULL);""",
        [user.username]
    )

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
                    # FR24 match — extract fields
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
