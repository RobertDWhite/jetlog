from server.db.session import SessionLocal
from server.db.models import Airport
from sqlalchemy import func

def get_icao_from_iata(iata: str) -> str | None:
    with SessionLocal() as session:
        result = session.query(Airport.icao).filter(
            func.lower(Airport.iata) == func.lower(iata.strip())
        ).first()
        return result[0] if result else None
