import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from server.db.session import get_db
from server.db.models import Companion, FlightCompanion, Flight
from server.auth.users import get_current_user
from server.models import CamelableModel, User

router = APIRouter(
    tags=["companions"],
    redirect_slashes=True,
)

MILES_PER_KM = 0.6213711922


class CompanionCreate(CamelableModel):
    name: str
    relation: str | None = None
    notes: str | None = None


class CompanionPatch(CamelableModel):
    name: str | None = None
    relation: str | None = None
    notes: str | None = None


class CompanionSummary(CamelableModel):
    id: int
    name: str
    relation: str | None = None
    notes: str | None = None
    created_on: datetime.datetime | None = None
    flight_count: int = 0
    total_distance: int = 0
    last_flight: str | None = None


class CompanionFlightSummary(CamelableModel):
    id: int
    date: str
    origin: str
    origin_iata: str | None = None
    destination: str
    destination_iata: str | None = None
    distance: int | None = None
    duration: int | None = None


class CompanionProfile(CamelableModel):
    id: int
    name: str
    relation: str | None = None
    notes: str | None = None
    created_on: datetime.datetime | None = None
    flight_count: int = 0
    total_distance: int = 0
    total_duration: int = 0
    unique_airports: int = 0
    unique_countries: int = 0
    first_flight: str | None = None
    last_flight: str | None = None
    top_destinations: list[dict] = []
    flights: list[CompanionFlightSummary] = []


class FlightCompanionsSet(CamelableModel):
    names: list[str] = []


class BulkAssignCompanions(CamelableModel):
    ids: list[int] = []
    names: list[str] = []


def _dedup_names(names: list[str]) -> list[str]:
    seen: set[str] = set()
    clean: list[str] = []
    for raw in names:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        clean.append(name)
    return clean


def _check_flight_access(flight_id: int, user: User, db: Session) -> Flight:
    """Verify the flight exists and the user owns it (or is admin)."""
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can modify other users' flights")
    return flight


def _get_or_create_companion(name: str, username: str, db: Session) -> Companion:
    """Find a companion by name (case-insensitive) for the owner, or create one."""
    name = name.strip()
    existing = db.query(Companion).filter(
        Companion.username == username,
        func.lower(Companion.name) == func.lower(name),
    ).first()
    if existing:
        return existing

    companion = Companion(username=username, name=name)
    db.add(companion)
    db.flush()  # populate id
    return companion


def _summary(companion: Companion, flight_count: int = 0,
             total_distance: int = 0, last_flight: str | None = None) -> CompanionSummary:
    return CompanionSummary(
        id=companion.id,
        name=companion.name,
        relation=companion.relation,
        notes=companion.notes,
        created_on=companion.created_on,
        flight_count=flight_count,
        total_distance=total_distance,
        last_flight=last_flight,
    )


@router.get("/companions")
async def list_companions(
    metric: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompanionSummary]:
    companions = db.query(Companion).filter(Companion.username == user.username).all()

    results = []
    for companion in companions:
        count, distance, last = db.query(
            func.count(Flight.id),
            func.coalesce(func.sum(Flight.distance), 0),
            func.max(Flight.date),
        ).join(
            FlightCompanion, FlightCompanion.flight_id == Flight.id
        ).filter(
            FlightCompanion.companion_id == companion.id,
            Flight.username == user.username,
        ).first()

        distance = int(distance or 0)
        if not metric:
            distance = round(distance * MILES_PER_KM)

        results.append(_summary(companion, count or 0, distance, last))

    results.sort(key=lambda c: (c.flight_count, c.name.lower()), reverse=False)
    results.reverse()
    return results


@router.post("/companions", status_code=201)
async def create_companion(
    body: CompanionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompanionSummary:
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    existing = db.query(Companion).filter(
        Companion.username == user.username,
        func.lower(Companion.name) == func.lower(name),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A companion with that name already exists")

    companion = Companion(
        username=user.username,
        name=name,
        relation=(body.relation or None),
        notes=(body.notes or None),
    )
    db.add(companion)
    db.commit()
    db.refresh(companion)
    return _summary(companion)


@router.patch("/companions/{companion_id}")
async def update_companion(
    companion_id: int,
    body: CompanionPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompanionSummary:
    companion = db.query(Companion).filter(
        Companion.id == companion_id,
        Companion.username == user.username,
    ).first()
    if not companion:
        raise HTTPException(status_code=404, detail="Companion not found")

    if body.name is not None and body.name.strip():
        new_name = body.name.strip()
        duplicate = db.query(Companion).filter(
            Companion.username == user.username,
            func.lower(Companion.name) == func.lower(new_name),
            Companion.id != companion_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="A companion with that name already exists")
        companion.name = new_name

    if body.relation is not None:
        companion.relation = body.relation or None
    if body.notes is not None:
        companion.notes = body.notes or None

    db.commit()
    db.refresh(companion)
    return _summary(companion)


@router.delete("/companions/{companion_id}", status_code=200)
async def delete_companion(
    companion_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    companion = db.query(Companion).filter(
        Companion.id == companion_id,
        Companion.username == user.username,
    ).first()
    if not companion:
        raise HTTPException(status_code=404, detail="Companion not found")

    db.delete(companion)
    db.commit()
    return {"status": "deleted", "id": companion_id}


@router.get("/companions/{companion_id}")
async def get_companion_profile(
    companion_id: int,
    metric: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompanionProfile:
    companion = db.query(Companion).filter(
        Companion.id == companion_id,
        Companion.username == user.username,
    ).first()
    if not companion:
        raise HTTPException(status_code=404, detail="Companion not found")

    rows = db.execute(text("""
        SELECT f.id, f.date, f.origin, o.iata, f.destination, d.iata,
               f.distance, f.duration, o.country, d.country
        FROM flights f
        JOIN flight_companions fc ON fc.flight_id = f.id
        JOIN airports o ON UPPER(f.origin) = o.icao
        JOIN airports d ON UPPER(f.destination) = d.icao
        WHERE fc.companion_id = :cid AND f.username = :username
        ORDER BY f.date DESC, f.departure_time DESC
    """), {"cid": companion_id, "username": user.username}).fetchall()

    flights: list[CompanionFlightSummary] = []
    total_distance = 0
    total_duration = 0
    airports: set[str] = set()
    countries: set[str] = set()
    dest_counts: dict[str, int] = {}
    dates: list[str] = []

    for row in rows:
        fid, date, o_icao, o_iata, d_icao, d_iata, distance, duration, o_country, d_country = row
        distance = distance or 0

        display_distance = round(distance * MILES_PER_KM) if (not metric and distance) else distance
        flights.append(CompanionFlightSummary(
            id=fid, date=date,
            origin=o_icao, origin_iata=o_iata,
            destination=d_icao, destination_iata=d_iata,
            distance=display_distance, duration=duration,
        ))

        total_distance += distance
        total_duration += duration or 0
        airports.update([o_icao, d_icao])
        if o_country:
            countries.add(o_country)
        if d_country:
            countries.add(d_country)
            dest_counts[d_country] = dest_counts.get(d_country, 0) + 1
        if date:
            dates.append(date)

    top_destinations = [
        {"country": country, "count": count}
        for country, count in sorted(dest_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]

    if not metric:
        total_distance = round(total_distance * MILES_PER_KM)

    return CompanionProfile(
        id=companion.id,
        name=companion.name,
        relation=companion.relation,
        notes=companion.notes,
        created_on=companion.created_on,
        flight_count=len(flights),
        total_distance=int(total_distance),
        total_duration=total_duration,
        unique_airports=len(airports),
        unique_countries=len(countries),
        first_flight=min(dates) if dates else None,
        last_flight=max(dates) if dates else None,
        top_destinations=top_destinations,
        flights=flights,
    )


@router.get("/flights/{flight_id}/companions")
async def get_flight_companions(
    flight_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompanionSummary]:
    _check_flight_access(flight_id, user, db)

    companions = db.query(Companion).join(
        FlightCompanion, FlightCompanion.companion_id == Companion.id
    ).filter(
        FlightCompanion.flight_id == flight_id
    ).order_by(Companion.name).all()

    return [_summary(c) for c in companions]


@router.post("/flights/{flight_id}/companions")
async def set_flight_companions(
    flight_id: int,
    body: FlightCompanionsSet,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CompanionSummary]:
    flight = _check_flight_access(flight_id, user, db)
    owner = flight.username

    companion_ids: list[int] = []
    for name in _dedup_names(body.names):
        companion = _get_or_create_companion(name, owner, db)
        companion_ids.append(companion.id)

    # Replace the flight's companion set with the new one
    db.query(FlightCompanion).filter(FlightCompanion.flight_id == flight_id).delete()
    for companion_id in companion_ids:
        db.add(FlightCompanion(flight_id=flight_id, companion_id=companion_id))
    db.commit()

    if not companion_ids:
        return []

    companions = db.query(Companion).filter(Companion.id.in_(companion_ids)).all()
    companions.sort(key=lambda c: companion_ids.index(c.id))
    return [_summary(c) for c in companions]


@router.post("/companions/bulk-assign")
async def bulk_assign_companions(
    body: BulkAssignCompanions,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Add companions to many flights at once, keeping each flight's existing companions."""
    names = _dedup_names(body.names)
    if not names or not body.ids:
        return {"updated": 0}

    # Verify access to every flight before making changes
    flights = [_check_flight_access(fid, user, db) for fid in body.ids]

    updated = 0
    for flight in flights:
        existing_ids = {
            row[0] for row in db.query(FlightCompanion.companion_id)
            .filter(FlightCompanion.flight_id == flight.id).all()
        }
        for name in names:
            companion = _get_or_create_companion(name, flight.username, db)
            if companion.id not in existing_ids:
                db.add(FlightCompanion(flight_id=flight.id, companion_id=companion.id))
                existing_ids.add(companion.id)
        updated += 1

    db.commit()
    return {"updated": updated}
