# Prometheus metrics endpoint
# To integrate into main.py, add:
#   from server.routers import metrics
#   app.include_router(metrics.router)
# (No prefix or auth dependency needed - metrics should be scrapable without auth)

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import Gauge, generate_latest, CollectorRegistry, CONTENT_TYPE_LATEST
from sqlalchemy import text
import logging

from server.db.session import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter()

# Custom registry to avoid conflicts with default process metrics
registry = CollectorRegistry()

# Define gauges
jetlog_flights_total = Gauge(
    'jetlog_flights_total',
    'Total number of flights',
    registry=registry
)
jetlog_distance_total_km = Gauge(
    'jetlog_distance_total_km',
    'Total distance flown in kilometers',
    registry=registry
)
jetlog_duration_total_hours = Gauge(
    'jetlog_duration_total_hours',
    'Total flight hours',
    registry=registry
)
jetlog_airports_visited = Gauge(
    'jetlog_airports_visited',
    'Number of unique airports visited',
    registry=registry
)
jetlog_countries_visited = Gauge(
    'jetlog_countries_visited',
    'Number of unique countries visited',
    registry=registry
)
jetlog_users_total = Gauge(
    'jetlog_users_total',
    'Number of registered users',
    registry=registry
)


def _collect_metrics():
    """Query the database and update all Prometheus gauges."""
    try:
        with SessionLocal() as session:
            # Total flights
            row = session.execute(text("SELECT COUNT(*) FROM flights;")).fetchone()
            jetlog_flights_total.set(row[0] if row else 0)

            # Total distance (km)
            row = session.execute(text("SELECT COALESCE(SUM(distance), 0) FROM flights WHERE distance IS NOT NULL;")).fetchone()
            jetlog_distance_total_km.set(row[0] if row else 0)

            # Total duration (stored in minutes, convert to hours)
            row = session.execute(text("SELECT COALESCE(SUM(duration), 0) FROM flights WHERE duration IS NOT NULL;")).fetchone()
            total_minutes = row[0] if row else 0
            jetlog_duration_total_hours.set(round(total_minutes / 60.0, 2))

            # Unique airports visited (union of origins and destinations)
            row = session.execute(text("""
                SELECT COUNT(DISTINCT ap) FROM (
                    SELECT origin AS ap FROM flights
                    UNION
                    SELECT destination AS ap FROM flights
                );
            """)).fetchone()
            jetlog_airports_visited.set(row[0] if row else 0)

            # Unique countries visited
            row = session.execute(text("""
                SELECT COUNT(DISTINCT a.country) FROM (
                    SELECT origin AS icao FROM flights
                    UNION
                    SELECT destination AS icao FROM flights
                ) visited
                JOIN airports a ON a.icao = visited.icao;
            """)).fetchone()
            jetlog_countries_visited.set(row[0] if row else 0)

            # Total users
            row = session.execute(text("SELECT COUNT(*) FROM users;")).fetchone()
            jetlog_users_total.set(row[0] if row else 0)

    except Exception as e:
        logger.error("Error collecting metrics: %s", e)


@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus-compatible metrics endpoint."""
    _collect_metrics()
    return Response(
        content=generate_latest(registry),
        media_type=CONTENT_TYPE_LATEST
    )
