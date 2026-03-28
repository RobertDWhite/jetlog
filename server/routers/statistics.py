from server.db.session import get_db
from server.db.models import Flight, Airport, Airline as AirlineDB
from server.models import StatisticsModel, User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import datetime

router = APIRouter(
    prefix="/statistics",
    tags=["statistics"],
    redirect_slashes=True
)

@router.get("", status_code=200)
async def get_statistics(metric: bool = True,
                         start: datetime.date|None = None,
                         end: datetime.date|None = None,
                         username: str|None = None,
                         user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)) -> StatisticsModel:

    filter_username = username if username else user.username

    # Build dynamic WHERE clause with named params
    filter_clauses = ["f.username = :username"]
    filter_params: dict = {"username": filter_username}

    if start:
        filter_clauses.append("JULIANDAY(f.date) > JULIANDAY(:start)")
        filter_params["start"] = str(start)
    if end:
        filter_clauses.append("JULIANDAY(f.date) < JULIANDAY(:end)")
        filter_params["end"] = str(end)

    filters = "WHERE " + " AND ".join(filter_clauses)

    # ---- simple numerical stats ----
    res = db.execute(text(f"""
        WITH visited_airports AS (
            SELECT destination AS icao
            FROM flights AS f
            {filters}
            AND connection IS NULL

            UNION

            SELECT origin AS icao
            FROM flights AS f
            {filters}
            AND NOT EXISTS (
               SELECT 1
               FROM flights AS prev
               WHERE prev.connection = f.id
            )
        )
        SELECT COUNT(*) AS total_flights,
               COALESCE(SUM(duration), 0) AS total_duration,
               COALESCE(SUM(distance), 0) AS total_distance,

               ( SELECT COUNT(DISTINCT ap) FROM (
                    SELECT origin AS ap FROM flights f {filters}
                    UNION ALL
                    SELECT destination as ap FROM flights f {filters}
                    )
               )
               AS total_unique_airports,

               COALESCE(( SELECT JULIANDAY(date)
                 FROM flights f {filters}
                 ORDER BY date DESC LIMIT 1 )
               -
               ( SELECT JULIANDAY(date)
                 FROM flights f {filters}
                 ORDER BY date ASC LIMIT 1 ), 0)
               AS days_range,

               ( SELECT COUNT(DISTINCT a.country)
                 FROM visited_airports va
                 JOIN airports AS a ON a.icao = va.icao
               )
               AS visited_countries

        FROM flights f {filters};
    """), filter_params).fetchall()

    statistics_db = res[0]

    # ---- top 5 visited airports ----
    res = db.execute(text(f"""
        SELECT COUNT(*) AS visits,
               a.icao,
               a.iata,
               a.municipality,
               a.country
        FROM airports a
        JOIN flights f
        ON (
            a.icao = UPPER(f.origin) OR
            ( a.icao = UPPER(f.destination) AND f.connection IS NULL )
        )
        {filters}
        GROUP BY a.icao
        ORDER BY visits DESC
        LIMIT 5;
    """), filter_params).fetchall()

    most_visited_airports = { }
    for airport in res:
        key = f"{airport[2] if airport[2] else airport[1]} - {airport[3]}/{airport[4]}"
        most_visited_airports[key] = airport[0]

    # ---- top 5 countries ----
    res = db.execute(text(f"""
        WITH seen_airports AS (
            SELECT origin AS icao
            FROM flights f
            {filters}

            UNION ALL

            SELECT destination AS icao
            FROM flights f
            {filters}
        )

        SELECT a.country, COUNT(*) as freq
        FROM seen_airports sa
        JOIN airports a ON a.icao = sa.icao
        GROUP BY a.country
        ORDER BY freq DESC
        LIMIT 5;
    """), filter_params).fetchall()
    most_common_countries = { pair[0]: pair[1] for pair in res }

    # ---- seats frequency ----
    res = db.execute(text(f"""
        SELECT seat, COUNT(*) AS freq
        FROM flights f
        {filters}
        GROUP BY seat
        ORDER BY freq DESC;
    """), filter_params).fetchall()
    seat_frequency = { pair[0]: pair[1] for pair in res }
    seat_frequency.pop(None, None)

    # ---- ticket class frequency ----
    res = db.execute(text(f"""
        SELECT ticket_class, COUNT(*) AS freq
        FROM flights f
        {filters}
        GROUP BY ticket_class
        ORDER BY freq DESC;
    """), filter_params).fetchall()
    ticket_class_frequency = { pair[0]: pair[1] for pair in res }
    ticket_class_frequency.pop(None, None)

    # ---- top 5 airlines ----
    res = db.execute(text(f"""
        SELECT a.name, COUNT(*) AS freq
        FROM flights f
        JOIN airlines a ON a.icao = f.airline
        {filters}
        GROUP BY a.icao
        ORDER BY freq DESC
        LIMIT 5;
    """), filter_params).fetchall()
    most_common_airlines = { }

    for airline in res:
        key = airline[0]
        most_common_airlines[key] = airline[1]

    # ---- flights by month ----
    res = db.execute(text(f"""
        SELECT strftime('%Y-%m', f.date) AS month, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY month
        ORDER BY month;
    """), filter_params).fetchall()
    flights_by_month = [{"month": r[0], "count": r[1]} for r in res]

    # ---- distance by month ----
    res = db.execute(text(f"""
        SELECT strftime('%Y-%m', f.date) AS month, COALESCE(SUM(f.distance), 0) AS distance
        FROM flights f
        {filters}
        GROUP BY month
        ORDER BY month;
    """), filter_params).fetchall()
    distance_by_month = [{"month": r[0], "distance": r[1] if metric else round(r[1] * 0.6213711922)} for r in res]

    # ---- top routes ----
    res = db.execute(text(f"""
        SELECT f.origin, f.destination, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY f.origin, f.destination
        ORDER BY count DESC
        LIMIT 5;
    """), filter_params).fetchall()
    top_routes = [{"origin": r[0], "destination": r[1], "count": r[2]} for r in res]

    # ---- top aircraft ----
    res = db.execute(text(f"""
        SELECT f.airplane, COUNT(*) AS count
        FROM flights f
        {filters}
        AND f.airplane IS NOT NULL
        GROUP BY f.airplane
        ORDER BY count DESC
        LIMIT 5;
    """), filter_params).fetchall()
    top_aircraft = [{"airplane": r[0], "count": r[1]} for r in res]

    # ---- records ----
    records = {}

    res = db.execute(text(f"""
        SELECT f.origin, f.destination, f.distance, f.date
        FROM flights f
        {filters}
        AND f.distance IS NOT NULL AND f.distance > 0
        ORDER BY f.distance DESC
        LIMIT 1;
    """), filter_params).fetchall()
    if res:
        d = res[0][2] if metric else round(res[0][2] * 0.6213711922)
        records["longestDistance"] = {"origin": res[0][0], "destination": res[0][1], "distance": d, "date": res[0][3]}

    res = db.execute(text(f"""
        SELECT f.origin, f.destination, f.distance, f.date
        FROM flights f
        {filters}
        AND f.distance IS NOT NULL AND f.distance > 0
        ORDER BY f.distance ASC
        LIMIT 1;
    """), filter_params).fetchall()
    if res:
        d = res[0][2] if metric else round(res[0][2] * 0.6213711922)
        records["shortestDistance"] = {"origin": res[0][0], "destination": res[0][1], "distance": d, "date": res[0][3]}

    res = db.execute(text(f"""
        SELECT f.origin, f.destination, f.duration, f.date
        FROM flights f
        {filters}
        AND f.duration IS NOT NULL AND f.duration > 0
        ORDER BY f.duration DESC
        LIMIT 1;
    """), filter_params).fetchall()
    if res:
        records["longestDuration"] = {"origin": res[0][0], "destination": res[0][1], "duration": res[0][2], "date": res[0][3]}

    res = db.execute(text(f"""
        SELECT f.date, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY f.date
        ORDER BY count DESC
        LIMIT 1;
    """), filter_params).fetchall()
    if res:
        records["mostFlightsInDay"] = {"date": res[0][0], "count": res[0][1]}

    res = db.execute(text(f"""
        SELECT strftime('%Y-%m', f.date) AS month, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY month
        ORDER BY count DESC
        LIMIT 1;
    """), filter_params).fetchall()
    if res:
        records["busiestMonth"] = {"month": res[0][0], "count": res[0][1]}

    # ---- total cost by currency ----
    res = db.execute(text(f"""
        SELECT f.currency, SUM(f.cost) AS total
        FROM flights f
        {filters}
        AND f.cost IS NOT NULL AND f.cost > 0
        GROUP BY f.currency
        ORDER BY total DESC;
    """), filter_params).fetchall()
    total_cost = {r[0]: round(r[1], 2) for r in res if r[0]}

    # ---- cost per km by currency ----
    res = db.execute(text(f"""
        SELECT f.currency, SUM(f.cost), SUM(f.distance)
        FROM flights f
        {filters}
        AND f.cost IS NOT NULL AND f.cost > 0
        AND f.distance IS NOT NULL AND f.distance > 0
        GROUP BY f.currency;
    """), filter_params).fetchall()
    cost_per_km = {}
    for r in res:
        if r[0] and r[2] > 0:
            cost_per_km[r[0]] = round(r[1] / r[2], 2)

    # ---- average cost by class ----
    res = db.execute(text(f"""
        SELECT f.ticket_class, f.currency, AVG(f.cost)
        FROM flights f
        {filters}
        AND f.cost IS NOT NULL AND f.cost > 0
        AND f.ticket_class IS NOT NULL
        GROUP BY f.ticket_class, f.currency
        ORDER BY AVG(f.cost) DESC;
    """), filter_params).fetchall()
    avg_cost_by_class = [{"class": r[0], "currency": r[1], "avg": round(r[2], 2)} for r in res if r[0] and r[1]]

    # ---- CO2 emissions estimate (~90g/km economy, class multipliers) ----
    co2_class_factor = {"economy": 1.0, "economy+": 1.2, "business": 2.0, "first": 3.0, "private": 4.0}
    res = db.execute(text(f"""
        SELECT f.distance, f.ticket_class
        FROM flights f
        {filters}
        AND f.distance IS NOT NULL AND f.distance > 0;
    """), filter_params).fetchall()
    total_co2_kg = 0.0
    for row in res:
        dist_km = row[0]
        factor = co2_class_factor.get(row[1], 1.0)
        total_co2_kg += dist_km * 0.09 * factor
    total_co2_kg = round(total_co2_kg, 1)

    # ---- average speed (km/h) ----
    res = db.execute(text(f"""
        SELECT COALESCE(SUM(f.distance), 0), COALESCE(SUM(f.duration), 0)
        FROM flights f
        {filters}
        AND f.distance IS NOT NULL AND f.distance > 0
        AND f.duration IS NOT NULL AND f.duration > 0;
    """), filter_params).fetchall()
    total_dist = res[0][0] if res else 0
    total_dur_min = res[0][1] if res else 0
    avg_speed_kmh = round((total_dist / (total_dur_min / 60)), 1) if total_dur_min > 0 else 0

    # ---- unique timezones visited ----
    res = db.execute(text(f"""
        SELECT COUNT(DISTINCT a.timezone) FROM (
            SELECT origin AS icao FROM flights f {filters}
            UNION
            SELECT destination AS icao FROM flights f {filters}
        ) visited
        JOIN airports a ON a.icao = visited.icao;
    """), filter_params).fetchall()
    unique_timezones = res[0][0] if res else 0

    # ---- continent completion ----
    continent_totals = {"AF": "Africa", "AN": "Antarctica", "AS": "Asia", "EU": "Europe", "NA": "North America", "OC": "Oceania", "SA": "South America"}
    res_total = db.execute(text("""
        SELECT continent, COUNT(DISTINCT country) FROM airports
        WHERE continent IS NOT NULL AND continent != ''
        GROUP BY continent;
    """)).fetchall()
    total_by_continent = {r[0]: r[1] for r in res_total}

    res_visited = db.execute(text(f"""
        SELECT a.continent, COUNT(DISTINCT a.country) FROM (
            SELECT destination AS icao FROM flights f {filters}
            UNION
            SELECT origin AS icao FROM flights f {filters}
        ) visited
        JOIN airports a ON a.icao = visited.icao
        WHERE a.continent IS NOT NULL AND a.continent != ''
        GROUP BY a.continent;
    """), filter_params).fetchall()
    visited_by_continent = {r[0]: r[1] for r in res_visited}

    continent_completion = []
    for code, name in continent_totals.items():
        total = total_by_continent.get(code, 0)
        visited = visited_by_continent.get(code, 0)
        if total > 0:
            continent_completion.append({"continent": name, "visited": visited, "total": total})

    # ---- flights by day (calendar heatmap) ----
    res = db.execute(text(f"""
        SELECT f.date, COUNT(*) AS count
        FROM flights f
        {filters}
        GROUP BY f.date;
    """), filter_params).fetchall()
    flights_by_day = [{"date": r[0], "count": r[1]} for r in res]

    # ---- average rating overall ----
    res = db.execute(text(f"""
        SELECT AVG(f.rating), COUNT(f.rating)
        FROM flights f
        {filters}
        AND f.rating IS NOT NULL;
    """), filter_params).fetchall()
    avg_rating = round(res[0][0], 1) if res and res[0][0] else 0
    rated_flights = res[0][1] if res else 0

    # ---- average rating by airline ----
    res = db.execute(text(f"""
        SELECT a.name, AVG(f.rating), COUNT(f.rating)
        FROM flights f
        JOIN airlines a ON a.icao = f.airline
        {filters}
        AND f.rating IS NOT NULL
        GROUP BY a.icao
        HAVING COUNT(f.rating) >= 1
        ORDER BY AVG(f.rating) DESC
        LIMIT 10;
    """), filter_params).fetchall()
    rating_by_airline = [{"airline": r[0], "avg": round(r[1], 1), "count": r[2]} for r in res]

    # ---- rating distribution (1-5) ----
    res = db.execute(text(f"""
        SELECT f.rating, COUNT(*)
        FROM flights f
        {filters}
        AND f.rating IS NOT NULL
        GROUP BY f.rating
        ORDER BY f.rating;
    """), filter_params).fetchall()
    rating_distribution = {str(r[0]): r[1] for r in res}

    # ---- aircraft side frequency ----
    res = db.execute(text(f"""
        SELECT aircraft_side, COUNT(*) AS freq
        FROM flights f
        {filters}
        AND aircraft_side IS NOT NULL
        GROUP BY aircraft_side
        ORDER BY freq DESC;
    """), filter_params).fetchall()
    side_frequency = {pair[0]: pair[1] for pair in res}

    # ---- layover analytics ----
    res = db.execute(text(f"""
        SELECT f.destination AS hub,
               f.arrival_time, f.date AS arr_date,
               c.departure_time, c.date AS dep_date
        FROM flights f
        JOIN flights c ON f.connection = c.id
        {filters}
        AND f.arrival_time IS NOT NULL AND c.departure_time IS NOT NULL;
    """), filter_params).fetchall()

    layover_times = []
    hub_counts: dict[str, int] = {}
    for row in res:
        hub, arr_time, arr_date, dep_time, dep_date = row
        try:
            arr_dt = datetime.datetime.strptime(f"{arr_date} {arr_time}", "%Y-%m-%d %H:%M")
            dep_dt = datetime.datetime.strptime(f"{dep_date} {dep_time}", "%Y-%m-%d %H:%M")
            layover_min = int((dep_dt - arr_dt).total_seconds() / 60)
            if layover_min > 0:
                layover_times.append({"hub": hub, "minutes": layover_min})
                hub_counts[hub] = hub_counts.get(hub, 0) + 1
        except (ValueError, TypeError):
            continue

    layover_stats = {}
    if layover_times:
        times = [l["minutes"] for l in layover_times]
        layover_stats["avgMinutes"] = round(sum(times) / len(times))
        shortest = min(layover_times, key=lambda l: l["minutes"])
        longest = max(layover_times, key=lambda l: l["minutes"])
        layover_stats["shortest"] = shortest
        layover_stats["longest"] = longest
        layover_stats["count"] = len(times)
        busiest_hub = max(hub_counts, key=hub_counts.get) if hub_counts else None
        if busiest_hub:
            layover_stats["busiestHub"] = {"icao": busiest_hub, "count": hub_counts[busiest_hub]}

    # ---- red-eye flights ----
    res = db.execute(text(f"""
        SELECT COUNT(*)
        FROM flights f
        {filters}
        AND f.departure_time IS NOT NULL
        AND (f.departure_time >= '21:00' OR f.departure_time < '06:00');
    """), filter_params).fetchall()
    redeye_count = res[0][0] if res else 0

    statistics = StatisticsModel.from_database(statistics_db,
                                               explicit={
                                                         "most_visited_airports": most_visited_airports,
                                                         "most_common_countries": most_common_countries,
                                                         "seat_frequency": seat_frequency,
                                                         "ticket_class_frequency": ticket_class_frequency,
                                                         "most_common_airlines": most_common_airlines,
                                                         "flights_by_month": flights_by_month,
                                                         "distance_by_month": distance_by_month,
                                                         "top_routes": top_routes,
                                                         "top_aircraft": top_aircraft,
                                                         "records": records,
                                                         "total_cost": total_cost,
                                                         "cost_per_km": cost_per_km,
                                                         "avg_cost_by_class": avg_cost_by_class,
                                                         "total_co2_kg": total_co2_kg,
                                                         "avg_speed_kmh": avg_speed_kmh,
                                                         "unique_timezones": unique_timezones,
                                                         "continent_completion": continent_completion,
                                                         "flights_by_day": flights_by_day,
                                                         "avg_rating": avg_rating,
                                                         "rated_flights": rated_flights,
                                                         "rating_by_airline": rating_by_airline,
                                                         "rating_distribution": rating_distribution,
                                                         "side_frequency": side_frequency,
                                                         "layover_stats": layover_stats,
                                                         "redeye_count": redeye_count,
                                                         })

    if not metric and statistics.total_distance:
        statistics.total_distance = round(statistics.total_distance * 0.6213711922)

    return StatisticsModel.model_validate(statistics)
