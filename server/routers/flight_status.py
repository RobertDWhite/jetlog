import datetime

import pytz
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.db.session import get_db
from server.db.models import Flight, Airport, Airline, FlightStatus
from server.environment import ENABLE_EXTERNAL_APIS
from server.auth.users import get_current_user
from server.models import User

router = APIRouter(
    prefix="/flight-status",
    tags=["flight-status"],
    redirect_slashes=True,
)

# Don't hit FR24 more often than this for a flight that hasn't landed yet
REFRESH_INTERVAL = datetime.timedelta(minutes=5)
FINAL_STATUSES = {"landed", "canceled", "diverted"}
ON_TIME_THRESHOLD = 15  # minutes, DOT/FAA definition of an on-time arrival


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _iso(ts: int | None) -> str | None:
    if ts is None:
        return None
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).isoformat()


def _minutes(later: int | None, earlier: int | None) -> int | None:
    if later is None or earlier is None:
        return None
    return round((later - earlier) / 60)


def _airport_tz(airport: Airport | None) -> pytz.BaseTzInfo:
    try:
        return pytz.timezone(airport.timezone) if airport and airport.timezone else pytz.utc
    except pytz.UnknownTimeZoneError:
        return pytz.utc


def _scheduled_departure_utc(flight: Flight, origin: Airport | None) -> datetime.datetime:
    """Best guess at a flight's departure in naive UTC from what jetlog stores."""
    date = datetime.date.fromisoformat(flight.date)
    hhmm = flight.departure_time or "12:00"
    local = datetime.datetime.combine(date, datetime.time.fromisoformat(hhmm))
    return _airport_tz(origin).localize(local).astimezone(pytz.utc).replace(tzinfo=None)


def _code_matches(fr24_airport: dict | None, airport: Airport | None) -> bool:
    if not fr24_airport or not airport:
        return True  # can't tell, don't reject on it
    code = fr24_airport.get("code") or {}
    return airport.icao in (code.get("icao"), code.get("iata")) or \
        (airport.iata is not None and airport.iata in (code.get("icao"), code.get("iata")))


def _match_entry(entries: list[dict], flight: Flight, origin: Airport | None, destination: Airport | None) -> dict | None:
    """Find the FR24 history entry for this flight's leg on this flight's date."""
    tz = _airport_tz(origin)
    for entry in entries:
        scheduled = ((entry.get("time") or {}).get("scheduled") or {}).get("departure")
        if not scheduled:
            continue
        local_date = datetime.datetime.fromtimestamp(scheduled, pytz.utc).astimezone(tz).date()
        if str(local_date) != flight.date:
            continue
        airports = entry.get("airport") or {}
        if _code_matches(airports.get("origin"), origin) and _code_matches(airports.get("destination"), destination):
            return entry
    return None


def _apply_entry(status: FlightStatus, entry: dict) -> None:
    times = entry.get("time") or {}
    scheduled = times.get("scheduled") or {}
    estimated = times.get("estimated") or {}
    real = times.get("real") or {}
    other = times.get("other") or {}
    fr24_status = entry.get("status") or {}
    generic = ((fr24_status.get("generic") or {}).get("status") or {}).get("text")

    status.status = generic
    status.status_text = fr24_status.get("text")
    status.live = 1 if fr24_status.get("live") else 0
    status.scheduled_departure = scheduled.get("departure")
    status.scheduled_arrival = scheduled.get("arrival")
    status.estimated_departure = estimated.get("departure")
    status.estimated_arrival = estimated.get("arrival") or other.get("eta")
    status.actual_departure = real.get("departure")
    status.actual_arrival = real.get("arrival")
    status.departure_delay = _minutes(status.actual_departure or status.estimated_departure, status.scheduled_departure)
    status.arrival_delay = _minutes(status.actual_arrival or status.estimated_arrival, status.scheduled_arrival)
    status.registration = (entry.get("aircraft") or {}).get("registration")
    status.final = 1 if generic in FINAL_STATUSES else 0


def _needs_refresh(status: FlightStatus | None, now: datetime.datetime) -> bool:
    if status is None or status.updated_at is None:
        return True
    if status.final:
        return False
    return now - status.updated_at >= REFRESH_INTERVAL


def _refresh(db: Session, flights: list[Flight], force: bool = False) -> None:
    """Look up FR24 history for any of these flights whose cached status is stale."""
    if not ENABLE_EXTERNAL_APIS:
        return

    from server.internal.flightradar24 import lookup_flight_history

    now = _utcnow()
    history_cache: dict[str, list[dict] | None] = {}

    for flight in flights:
        if not flight.flight_number:
            continue
        status = db.query(FlightStatus).filter(FlightStatus.flight_id == flight.id).first()
        if not force and not _needs_refresh(status, now):
            continue

        if flight.flight_number not in history_cache:
            try:
                history_cache[flight.flight_number] = lookup_flight_history(flight.flight_number, max_retries=2)
            except Exception as e:
                print(f"flight-status: FR24 lookup for {flight.flight_number} failed: {e}")
                history_cache[flight.flight_number] = None
        entries = history_cache[flight.flight_number]
        if entries is None:
            continue

        origin = db.query(Airport).filter(Airport.icao == flight.origin.upper()).first()
        destination = db.query(Airport).filter(Airport.icao == flight.destination.upper()).first()
        entry = _match_entry(entries, flight, origin, destination)

        if status is None:
            status = FlightStatus(flight_id=flight.id)
            db.add(status)
        if entry is not None:
            _apply_entry(status, entry)
        status.updated_at = now

    db.commit()


def _serialize(db: Session, flight: Flight, status: FlightStatus | None) -> dict:
    origin = db.query(Airport).filter(Airport.icao == flight.origin.upper()).first()
    destination = db.query(Airport).filter(Airport.icao == flight.destination.upper()).first()
    airline = db.query(Airline).filter(Airline.icao == flight.airline.upper()).first() if flight.airline else None

    def airport(ap: Airport | None, icao: str) -> dict:
        if ap is None:
            return {"icao": icao}
        return {"icao": ap.icao, "iata": ap.iata, "name": ap.name, "municipality": ap.municipality,
                "country": ap.country, "latitude": ap.latitude, "longitude": ap.longitude,
                "timezone": ap.timezone}

    result = {
        "flight_id": flight.id,
        "date": flight.date,
        "flight_number": flight.flight_number,
        "airline": airline.name if airline else flight.airline,
        "origin": airport(origin, flight.origin),
        "destination": airport(destination, flight.destination),
        "departure_time": flight.departure_time,
        "arrival_time": flight.arrival_time,
        "arrival_date": flight.arrival_date,
        "scheduled_departure_utc": _scheduled_departure_utc(flight, origin).replace(tzinfo=datetime.timezone.utc).isoformat(),
        "status": None,
    }
    if status is not None and status.status is not None:
        result["status"] = {
            "status": status.status,
            "status_text": status.status_text,
            "live": bool(status.live),
            "scheduled_departure": _iso(status.scheduled_departure),
            "scheduled_arrival": _iso(status.scheduled_arrival),
            "estimated_departure": _iso(status.estimated_departure),
            "estimated_arrival": _iso(status.estimated_arrival),
            "actual_departure": _iso(status.actual_departure),
            "actual_arrival": _iso(status.actual_arrival),
            "departure_delay": status.departure_delay,
            "arrival_delay": status.arrival_delay,
            "registration": status.registration,
            "final": bool(status.final),
            "updated_at": status.updated_at.replace(tzinfo=datetime.timezone.utc).isoformat() if status.updated_at else None,
        }
    return result


def _user_flights_between(db: Session, username: str, start: datetime.date, end: datetime.date) -> list[Flight]:
    return db.query(Flight) \
        .filter(Flight.username == username) \
        .filter(Flight.date >= str(start), Flight.date <= str(end)) \
        .order_by(Flight.date, Flight.departure_time) \
        .all()


def _statuses(db: Session, flights: list[Flight]) -> dict[int, FlightStatus]:
    ids = [f.id for f in flights]
    if not ids:
        return {}
    return {s.flight_id: s for s in db.query(FlightStatus).filter(FlightStatus.flight_id.in_(ids)).all()}


@router.get("/active", status_code=200)
def get_active_flight_status(hours_behind: int = 12,
                             hours_ahead: int = 48,
                             user: User = Depends(get_current_user),
                             db: Session = Depends(get_db)) -> list[dict]:
    """Live status (refreshed from FR24 when stale) for flights departing in the given window."""
    now = _utcnow()
    today = now.date()
    candidates = _user_flights_between(db, user.username,
                                       today - datetime.timedelta(days=1 + hours_behind // 24),
                                       today + datetime.timedelta(days=1 + hours_ahead // 24))
    window_start = now - datetime.timedelta(hours=hours_behind)
    window_end = now + datetime.timedelta(hours=hours_ahead)

    flights = []
    for flight in candidates:
        origin = db.query(Airport).filter(Airport.icao == flight.origin.upper()).first()
        if window_start <= _scheduled_departure_utc(flight, origin) <= window_end:
            flights.append(flight)

    _refresh(db, flights)
    statuses = _statuses(db, flights)
    return [_serialize(db, f, statuses.get(f.id)) for f in flights]


@router.post("/backfill", status_code=200)
def backfill_flight_status(days: int = 10,
                           user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)) -> dict:
    """Record delays for recent flights. FR24's free history only reaches back about a week."""
    today = _utcnow().date()
    flights = _user_flights_between(db, user.username, today - datetime.timedelta(days=days), today)
    before = _statuses(db, flights)
    pending = [f for f in flights if not (before.get(f.id) and before[f.id].final)]
    _refresh(db, pending, force=True)
    after = _statuses(db, flights)
    return {
        "checked": len(pending),
        "recorded": sum(1 for f in pending if after.get(f.id) and after[f.id].final),
    }


@router.get("/summary", status_code=200)
def get_delay_summary(recent: int = 10,
                      user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)) -> dict:
    """Delay statistics across every flight with a recorded status."""
    rows = db.query(Flight, FlightStatus) \
        .join(FlightStatus, FlightStatus.flight_id == Flight.id) \
        .filter(Flight.username == user.username) \
        .filter(FlightStatus.final == 1) \
        .order_by(Flight.date.desc(), Flight.departure_time.desc()) \
        .all()

    completed = [(f, s) for f, s in rows if s.status == "landed" and s.arrival_delay is not None]
    dep_delays = [s.departure_delay for _, s in completed if s.departure_delay is not None]
    arr_delays = [s.arrival_delay for _, s in completed]
    worst = max(completed, key=lambda fs: fs[1].arrival_delay, default=None)

    return {
        "flights_tracked": len(rows),
        "flights_landed": len(completed),
        "canceled": sum(1 for _, s in rows if s.status == "canceled"),
        "diverted": sum(1 for _, s in rows if s.status == "diverted"),
        "on_time": sum(1 for d in arr_delays if d < ON_TIME_THRESHOLD),
        "delayed": sum(1 for d in arr_delays if d >= ON_TIME_THRESHOLD),
        "on_time_percentage": round(100 * sum(1 for d in arr_delays if d < ON_TIME_THRESHOLD) / len(arr_delays), 1) if arr_delays else None,
        "average_departure_delay": round(sum(dep_delays) / len(dep_delays), 1) if dep_delays else None,
        "average_arrival_delay": round(sum(arr_delays) / len(arr_delays), 1) if arr_delays else None,
        "total_delay_minutes": sum(d for d in arr_delays if d > 0),
        "worst": _serialize(db, *worst) if worst else None,
        "recent": [_serialize(db, f, s) for f, s in rows[:recent]],
    }


@router.get("/{flight_id}", status_code=200)
def get_flight_status(flight_id: int,
                      refresh: bool = True,
                      user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)) -> dict:
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    if not flight or (flight.username != user.username and not user.is_admin):
        raise HTTPException(status_code=404, detail="Flight not found.")
    if refresh:
        _refresh(db, [flight])
    return _serialize(db, flight, _statuses(db, [flight]).get(flight.id))
