from server.db.session import get_db
from server.db.models import Flight, Airport
from server.models import User
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta

router = APIRouter(
    prefix="/compensation",
    tags=["compensation"],
    redirect_slashes=True
)

# EU27 + EEA (Iceland, Liechtenstein, Norway) + Switzerland
EU_COUNTRIES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    "IS", "LI", "NO", "CH",
}

CLAIM_WINDOW_YEARS = 3


def _compensation_tier(distance_km: int) -> int:
    """Return EU261 compensation amount in EUR based on flight distance."""
    if distance_km <= 1500:
        return 250
    elif distance_km <= 3500:
        return 400
    else:
        return 600


@router.get("/eligible")
async def get_eligible_flights(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Return flights potentially eligible for EU261/2004 compensation.

    EU261 applies when:
    - Departure from an EU/EEA airport, OR
    - Arrival at an EU/EEA airport on an EU carrier

    Since we don't track carrier nationality, we include any flight
    touching an EU/EEA airport. The user must verify delay >= 3 hours
    and absence of extraordinary circumstances.
    """
    flights = (
        db.query(Flight)
        .filter(Flight.username == user.username)
        .all()
    )

    today = date.today()
    cutoff = today - timedelta(days=CLAIM_WINDOW_YEARS * 365)

    eligible = []
    for flight in flights:
        # Parse flight date
        try:
            flight_date = datetime.strptime(flight.date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue

        # Skip flights outside the claim window
        if flight_date < cutoff:
            continue

        origin_airport = (
            db.query(Airport).filter(Airport.icao == flight.origin).first()
        )
        dest_airport = (
            db.query(Airport).filter(Airport.icao == flight.destination).first()
        )

        if not origin_airport or not dest_airport:
            continue

        origin_country = origin_airport.country or ""
        dest_country = dest_airport.country or ""

        origin_in_eu = origin_country in EU_COUNTRIES
        dest_in_eu = dest_country in EU_COUNTRIES

        # Must touch at least one EU/EEA airport
        if not origin_in_eu and not dest_in_eu:
            continue

        distance = flight.distance or 0
        compensation_eur = _compensation_tier(distance)

        claim_deadline = flight_date + timedelta(days=CLAIM_WINDOW_YEARS * 365)
        days_until_deadline = (claim_deadline - today).days

        eligible.append({
            "flightId": flight.id,
            "date": flight.date,
            "origin": flight.origin,
            "destination": flight.destination,
            "originCity": origin_airport.municipality,
            "destinationCity": dest_airport.municipality,
            "originCountry": origin_country,
            "destinationCountry": dest_country,
            "flightNumber": flight.flight_number,
            "airline": flight.airline,
            "distance": distance,
            "compensationEur": compensation_eur,
            "originInEu": origin_in_eu,
            "destinationInEu": dest_in_eu,
            "claimDeadline": claim_deadline.isoformat(),
            "daysUntilDeadline": days_until_deadline,
        })

    # Sort by deadline (most urgent first)
    eligible.sort(key=lambda x: x["daysUntilDeadline"])

    return {
        "eligibleFlights": eligible,
        "totalPotentialCompensation": sum(
            f["compensationEur"] for f in eligible
        ),
        "note": (
            "Compensation applies only if your flight was delayed 3+ hours "
            "at arrival, was cancelled, or you were denied boarding. "
            "Weather, strikes, and security issues are generally excluded."
        ),
    }


@router.get("/summary")
async def get_compensation_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregate compensation statistics."""
    # Re-use the eligible logic
    result = await get_eligible_flights(db=db, user=user)
    flights = result["eligibleFlights"]

    by_tier = {"250": 0, "400": 0, "600": 0}
    expiring_within_90 = 0
    oldest_deadline = None

    for f in flights:
        tier_key = str(f["compensationEur"])
        by_tier[tier_key] = by_tier.get(tier_key, 0) + 1

        if f["daysUntilDeadline"] <= 90:
            expiring_within_90 += 1

        dl = f["claimDeadline"]
        if oldest_deadline is None or dl < oldest_deadline:
            oldest_deadline = dl

    return {
        "totalEligibleFlights": len(flights),
        "totalPotentialEur": result["totalPotentialCompensation"],
        "byTier": by_tier,
        "expiringWithin90Days": expiring_within_90,
        "oldestClaimDeadline": oldest_deadline,
    }
