from server.db.session import get_db
from server.db.models import Flight, Airport, Airline
from server.models import User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import datetime

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    redirect_slashes=True
)


def _build_filters(username: str,
                   start: datetime.date | None,
                   end: datetime.date | None) -> tuple[str, dict]:
    """Build a WHERE clause and params dict for analytics queries."""
    clauses = ["f.username = :username"]
    params: dict = {"username": username}

    if start:
        clauses.append("JULIANDAY(f.date) >= JULIANDAY(:start)")
        params["start"] = str(start)
    if end:
        clauses.append("JULIANDAY(f.date) <= JULIANDAY(:end)")
        params["end"] = str(end)

    return "WHERE " + " AND ".join(clauses), params


@router.get("/routes", status_code=200)
async def get_route_analytics(username: str | None = None,
                              start: datetime.date | None = None,
                              end: datetime.date | None = None,
                              user: User = Depends(get_current_user),
                              db: Session = Depends(get_db)):
    """
    Returns top routes with frequency, total distance, average duration,
    and the set of airlines that have operated each route.
    """
    filter_username = username if username else user.username
    filters, params = _build_filters(filter_username, start, end)

    # Get route counts, total distance, average duration
    res = db.execute(text(f"""
        SELECT f.origin,
               f.destination,
               COUNT(*) AS count,
               COALESCE(SUM(f.distance), 0) AS total_distance,
               COALESCE(ROUND(AVG(f.duration)), 0) AS avg_duration
        FROM flights f
        {filters}
        GROUP BY f.origin, f.destination
        ORDER BY count DESC;
    """), params).fetchall()

    routes = []
    for r in res:
        origin = r[0]
        destination = r[1]

        # Get distinct airlines for this route
        airline_res = db.execute(text(f"""
            SELECT DISTINCT f.airline
            FROM flights f
            {filters}
            AND f.origin = :route_origin
            AND f.destination = :route_dest
            AND f.airline IS NOT NULL;
        """), {**params, "route_origin": origin, "route_dest": destination}).fetchall()

        airlines = [row[0] for row in airline_res]

        routes.append({
            "origin": origin,
            "destination": destination,
            "count": r[2],
            "totalDistance": r[3],
            "avgDuration": r[4],
            "airlines": airlines,
        })

    return routes


@router.get("/airports", status_code=200)
async def get_airport_analytics(username: str | None = None,
                                start: datetime.date | None = None,
                                end: datetime.date | None = None,
                                user: User = Depends(get_current_user),
                                db: Session = Depends(get_db)):
    """
    Returns airport visit statistics: total visits, as origin, as destination,
    airlines seen, first and last visit dates.
    """
    filter_username = username if username else user.username
    filters, params = _build_filters(filter_username, start, end)

    # Combine origin and destination visits into a single result set
    res = db.execute(text(f"""
        WITH airport_visits AS (
            SELECT f.origin AS icao, 'origin' AS role, f.date, f.airline
            FROM flights f
            {filters}

            UNION ALL

            SELECT f.destination AS icao, 'destination' AS role, f.date, f.airline
            FROM flights f
            {filters}
        )
        SELECT av.icao,
               COUNT(*) AS visits,
               SUM(CASE WHEN av.role = 'origin' THEN 1 ELSE 0 END) AS as_origin,
               SUM(CASE WHEN av.role = 'destination' THEN 1 ELSE 0 END) AS as_destination,
               MIN(av.date) AS first_visit,
               MAX(av.date) AS last_visit
        FROM airport_visits av
        GROUP BY av.icao
        ORDER BY visits DESC;
    """), params).fetchall()

    airports = []
    for r in res:
        icao = r[0]

        # Look up airport name
        airport_row = db.execute(text("""
            SELECT name FROM airports WHERE icao = :icao;
        """), {"icao": icao}).fetchone()
        name = airport_row[0] if airport_row else icao

        # Get distinct airlines at this airport
        airline_res = db.execute(text(f"""
            SELECT DISTINCT f.airline
            FROM flights f
            {filters}
            AND (f.origin = :icao OR f.destination = :icao)
            AND f.airline IS NOT NULL;
        """), {**params, "icao": icao}).fetchall()
        airlines = [row[0] for row in airline_res]

        airports.append({
            "icao": icao,
            "name": name,
            "visits": r[1],
            "asOrigin": r[2],
            "asDestination": r[3],
            "airlines": airlines,
            "firstVisit": r[4],
            "lastVisit": r[5],
        })

    return airports


@router.get("/aircraft", status_code=200)
async def get_aircraft_analytics(username: str | None = None,
                                 start: datetime.date | None = None,
                                 end: datetime.date | None = None,
                                 user: User = Depends(get_current_user),
                                 db: Session = Depends(get_db)):
    """
    Returns aircraft type statistics: count, total distance, and airlines.
    """
    filter_username = username if username else user.username
    filters, params = _build_filters(filter_username, start, end)

    res = db.execute(text(f"""
        SELECT f.airplane,
               COUNT(*) AS count,
               COALESCE(SUM(f.distance), 0) AS total_distance
        FROM flights f
        {filters}
        AND f.airplane IS NOT NULL
        GROUP BY f.airplane
        ORDER BY count DESC;
    """), params).fetchall()

    aircraft = []
    for r in res:
        airplane_type = r[0]

        # Get distinct airlines for this aircraft type
        airline_res = db.execute(text(f"""
            SELECT DISTINCT f.airline
            FROM flights f
            {filters}
            AND f.airplane = :airplane
            AND f.airline IS NOT NULL;
        """), {**params, "airplane": airplane_type}).fetchall()
        airlines = [row[0] for row in airline_res]

        aircraft.append({
            "type": airplane_type,
            "count": r[1],
            "totalDistance": r[2],
            "airlines": airlines,
        })

    return aircraft


@router.get("/tail-numbers", status_code=200)
async def get_tail_number_analytics(username: str | None = None,
                                    start: datetime.date | None = None,
                                    end: datetime.date | None = None,
                                    user: User = Depends(get_current_user),
                                    db: Session = Depends(get_db)):
    """
    Returns tail number tracking: count, aircraft type, airline, first and last flight.
    """
    filter_username = username if username else user.username
    filters, params = _build_filters(filter_username, start, end)

    res = db.execute(text(f"""
        SELECT f.tail_number,
               COUNT(*) AS count,
               f.airplane,
               f.airline,
               MIN(f.date) AS first_flight,
               MAX(f.date) AS last_flight
        FROM flights f
        {filters}
        AND f.tail_number IS NOT NULL
        GROUP BY f.tail_number
        ORDER BY count DESC;
    """), params).fetchall()

    tail_numbers = []
    for r in res:
        tail_numbers.append({
            "tailNumber": r[0],
            "count": r[1],
            "aircraft": r[2],
            "airline": r[3],
            "firstFlight": r[4],
            "lastFlight": r[5],
        })

    return tail_numbers


@router.get("/heatmap", status_code=200)
async def get_heatmap(year: int | None = None,
                      username: str | None = None,
                      start: datetime.date | None = None,
                      end: datetime.date | None = None,
                      user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """
    Returns flight count per day for the heatmap calendar.
    Optionally filter by year (returns only that year's data).
    """
    filter_username = username if username else user.username
    filters, params = _build_filters(filter_username, start, end)

    # If year is specified and no explicit start/end, add year filter
    if year and not start and not end:
        filters += " AND strftime('%Y', f.date) = :year"
        params["year"] = str(year)

    res = db.execute(text(f"""
        SELECT f.date, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY f.date
        ORDER BY f.date;
    """), params).fetchall()

    heatmap = []
    for r in res:
        heatmap.append({
            "date": r[0],
            "count": r[1],
        })

    return heatmap
