from server.db.session import get_db
from server.db.models import Airport
from server.models import AirportModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

router = APIRouter(
    prefix="/airports",
    tags=["airports"],
    redirect_slashes=True
)


@router.get("", status_code=200)
async def get_airports(q: str, db: Session = Depends(get_db)) -> list[AirportModel]:
    like_q = f"%{q}%"
    lower_q = q.lower()

    results = db.query(Airport).filter(
        (func.lower(Airport.iata).like(f"%{lower_q}%")) |
        (func.lower(Airport.name).like(f"%{lower_q}%")) |
        (func.lower(Airport.municipality).like(f"%{lower_q}%")) |
        (func.lower(Airport.region).like(f"%{lower_q}%")) |
        (func.lower(Airport.icao).like(f"%{lower_q}%"))
    ).order_by(
        (func.lower(Airport.iata) == lower_q).desc(),
        (func.lower(Airport.name) == lower_q).desc(),
        func.length(Airport.name).asc(),
        (func.lower(Airport.municipality) == lower_q).desc(),
        (func.lower(Airport.region).like(f"%{lower_q}%")).desc(),
        (func.lower(Airport.icao) == lower_q).desc(),
    ).limit(5).all()

    airports = [AirportModel.model_validate(ap) for ap in results]
    return airports


@router.get("/{icao}", status_code=200)
async def get_airport_from_icao(icao: str, db: Session = Depends(get_db)) -> AirportModel:
    result = db.query(Airport).filter(func.lower(Airport.icao) == func.lower(icao)).first()

    if not result:
        raise HTTPException(status_code=404, detail=f"No airport with ICAO '{icao}' found")

    return AirportModel.model_validate(result)
