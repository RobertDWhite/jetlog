from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from server.db.session import get_db
from server.db.models import FrequentFlyerEntry, Flight
from server.auth.users import get_current_user
from server.models import User

router = APIRouter(
    tags=["frequent-flyer"],
    redirect_slashes=True,
)


class FrequentFlyerCreate(BaseModel):
    program_name: str
    member_number: str | None = None
    miles_earned: int = 0
    status_credits: int = 0


class FrequentFlyerResponse(BaseModel):
    id: int
    flight_id: int
    program_name: str
    member_number: str | None = None
    miles_earned: int
    status_credits: int

    class Config:
        from_attributes = True


class ProgramSummary(BaseModel):
    program_name: str
    total_miles: int
    total_status_credits: int
    total_flights: int


class FrequentFlyerSummaryResponse(BaseModel):
    programs: list[ProgramSummary]
    total_miles: int
    total_flights: int


def _check_flight_access(flight_id: int, user: User, db: Session) -> Flight:
    """Verify the flight exists and the user owns it (or is admin)."""
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    if flight.username != user.username and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can modify other users' flights")
    return flight


@router.post("/flights/{flight_id}/frequent-flyer", status_code=201)
async def add_frequent_flyer(
    flight_id: int,
    body: FrequentFlyerCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FrequentFlyerResponse:
    _check_flight_access(flight_id, user, db)

    if not body.program_name or not body.program_name.strip():
        raise HTTPException(status_code=400, detail="Program name is required")

    # Check if entry already exists for this flight - update it
    existing = db.query(FrequentFlyerEntry).filter(
        FrequentFlyerEntry.flight_id == flight_id
    ).first()

    if existing:
        existing.program_name = body.program_name.strip()
        existing.member_number = body.member_number
        existing.miles_earned = body.miles_earned
        existing.status_credits = body.status_credits
        db.commit()
        db.refresh(existing)
        return FrequentFlyerResponse(
            id=existing.id,
            flight_id=existing.flight_id,
            program_name=existing.program_name,
            member_number=existing.member_number,
            miles_earned=existing.miles_earned,
            status_credits=existing.status_credits,
        )

    entry = FrequentFlyerEntry(
        flight_id=flight_id,
        program_name=body.program_name.strip(),
        member_number=body.member_number,
        miles_earned=body.miles_earned,
        status_credits=body.status_credits,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return FrequentFlyerResponse(
        id=entry.id,
        flight_id=entry.flight_id,
        program_name=entry.program_name,
        member_number=entry.member_number,
        miles_earned=entry.miles_earned,
        status_credits=entry.status_credits,
    )


@router.get("/flights/{flight_id}/frequent-flyer")
async def get_frequent_flyer(
    flight_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FrequentFlyerResponse | None:
    _check_flight_access(flight_id, user, db)

    entry = db.query(FrequentFlyerEntry).filter(
        FrequentFlyerEntry.flight_id == flight_id
    ).first()

    if not entry:
        return None

    return FrequentFlyerResponse(
        id=entry.id,
        flight_id=entry.flight_id,
        program_name=entry.program_name,
        member_number=entry.member_number,
        miles_earned=entry.miles_earned,
        status_credits=entry.status_credits,
    )


@router.delete("/flights/{flight_id}/frequent-flyer", status_code=200)
async def delete_frequent_flyer(
    flight_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _check_flight_access(flight_id, user, db)

    deleted = db.query(FrequentFlyerEntry).filter(
        FrequentFlyerEntry.flight_id == flight_id
    ).delete()

    db.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="No frequent flyer entry found for this flight")

    return {"status": "deleted", "flight_id": flight_id}


@router.get("/frequent-flyer/summary")
async def get_frequent_flyer_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FrequentFlyerSummaryResponse:
    # Get all frequent flyer entries for flights owned by this user
    entries = (
        db.query(FrequentFlyerEntry)
        .join(Flight, FrequentFlyerEntry.flight_id == Flight.id)
        .filter(Flight.username == user.username)
        .all()
    )

    # Aggregate by program
    programs: dict[str, dict] = {}
    for entry in entries:
        name = entry.program_name
        if name not in programs:
            programs[name] = {
                "program_name": name,
                "total_miles": 0,
                "total_status_credits": 0,
                "total_flights": 0,
            }
        programs[name]["total_miles"] += entry.miles_earned or 0
        programs[name]["total_status_credits"] += entry.status_credits or 0
        programs[name]["total_flights"] += 1

    program_list = [ProgramSummary(**p) for p in programs.values()]
    program_list.sort(key=lambda p: p.total_miles, reverse=True)

    total_miles = sum(p.total_miles for p in program_list)
    total_flights = sum(p.total_flights for p in program_list)

    return FrequentFlyerSummaryResponse(
        programs=program_list,
        total_miles=total_miles,
        total_flights=total_flights,
    )
