from server.db.session import get_db
from server.db.models import Airline
from server.models import AirlineModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

router = APIRouter(
    prefix="/airlines",
    tags=["airlines"],
    redirect_slashes=True
)


@router.get("", status_code=200)
async def get_airlines(q: str, db: Session = Depends(get_db)) -> list[AirlineModel]:
    lower_q = q.lower()

    results = db.query(Airline).filter(
        (func.lower(Airline.name).like(f"%{lower_q}%")) |
        (func.lower(Airline.icao).like(f"%{lower_q}%")) |
        (func.lower(Airline.iata).like(f"%{lower_q}%"))
    ).order_by(
        (func.lower(Airline.name) == lower_q).desc(),
        func.length(Airline.name).asc(),
        (func.lower(Airline.icao) == lower_q).desc(),
        (func.lower(Airline.iata) == lower_q).desc(),
    ).limit(5).all()

    airlines = [AirlineModel.model_validate(al) for al in results]
    return airlines


@router.get("/{icao}", status_code=200)
async def get_airline_from_icao(icao: str, db: Session = Depends(get_db)) -> AirlineModel:
    result = db.query(Airline).filter(func.lower(Airline.icao) == func.lower(icao)).first()

    if not result:
        raise HTTPException(status_code=404, detail=f"No airline with ICAO '{icao}' found")

    return AirlineModel.model_validate(result)
