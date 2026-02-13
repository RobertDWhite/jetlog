import re
import requests
import time as _time

from server.models import AirportModel, AirlineModel, FlightModel, SeatType, ClassType, FlightPurpose


def _normalize_flight_number(fn: str) -> str:
    """Normalize flight number for FR24 API: strip spaces and leading zeros.
    e.g. 'DL 0271' -> 'DL271', 'DL 4972' -> 'DL4972'
    """
    fn = fn.replace(" ", "")
    m = re.match(r'^([A-Z]{1,3})0*(\d+)$', fn, re.IGNORECASE)
    if m:
        return m.group(1) + m.group(2)
    return fn


def lookup_flightera(flight_number: str, date: str, api_key: str) -> dict | None:
    """Query Flightera (RapidAPI) for a specific flight on a specific date.

    Returns a normalized dict with keys: aircraft_text, registration,
    real_departure, real_arrival (as HH:MM local time strings),
    origin_tz_offset, dest_tz_offset (always 0 since times are already local).
    Returns None if no match or date out of subscription range.
    """
    flight_number = _normalize_flight_number(flight_number)
    resp = requests.get(
        "https://flightera-flight-data.p.rapidapi.com/flight/info",
        params={"flnr": flight_number, "date": date},
        headers={
            "X-RapidAPI-Key": api_key,
            "X-RapidAPI-Host": "flightera-flight-data.p.rapidapi.com",
        },
    )
    if resp.status_code == 429:
        _time.sleep(5)
        resp = requests.get(
            "https://flightera-flight-data.p.rapidapi.com/flight/info",
            params={"flnr": flight_number, "date": date},
            headers={
                "X-RapidAPI-Key": api_key,
                "X-RapidAPI-Host": "flightera-flight-data.p.rapidapi.com",
            },
        )
    if resp.status_code != 200:
        return None
    data = resp.json()
    if isinstance(data, dict) and "Error" in data:
        return None
    flights = data if isinstance(data, list) else [data]

    for flight in flights:
        if flight.get("status") != "landed":
            continue

        # Flightera response fields:
        #   model: "B739", reg: "N812DN",
        #   actual_departure_local: "2026-02-10T22:40:17-05:00"
        #   actual_arrival_local: "2026-02-10T23:37:02-05:00"
        model = flight.get("model") or flight.get("family")
        reg = flight.get("reg")

        # Parse local times to HH:MM strings
        dep_local = flight.get("actual_departure_local") or flight.get("scheduled_departure_local")
        arr_local = flight.get("actual_arrival_local") or flight.get("scheduled_arrival_local")

        dep_time_str = dep_local[11:16] if dep_local and len(dep_local) >= 16 else None
        arr_time_str = arr_local[11:16] if arr_local and len(arr_local) >= 16 else None

        if model or reg or dep_time_str:
            return {
                "aircraft_text": model,
                "registration": reg,
                "real_departure": dep_time_str,  # already HH:MM local
                "real_arrival": arr_time_str,     # already HH:MM local
                "origin_tz_offset": 0,  # not needed, times are local
                "dest_tz_offset": 0,
            }

    return None


def lookup_flight_history(flight_number: str, max_retries: int = 5) -> list[dict]:
    """Query the FR24 public flight history API (no auth required).

    Returns the list of flight entries from the API response.
    Each entry contains aircraft info, timestamps, and timezone offsets.
    Retries with exponential backoff on 429 rate-limit responses.
    """
    flight_number = _normalize_flight_number(flight_number)
    delay = 2
    for attempt in range(max_retries):
        resp = requests.get(
            "https://api.flightradar24.com/common/v1/flight/list.json",
            params={
                "query": flight_number,
                "fetchBy": "flight",
                "page": 1,
                "limit": 100,
            },
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        )
        if resp.status_code == 429:
            _time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
        data = resp.json()
        return data.get("result", {}).get("response", {}).get("data", []) or []
    resp.raise_for_status()  # raise the 429 if all retries exhausted
    return []


SEAT_TYPE_TO_FR24 = {
    SeatType.WINDOW: "1",
    SeatType.MIDDLE: "2",
    SeatType.AISLE: "3",
}

CLASS_TYPE_TO_FR24 = {
    ClassType.ECONOMY: "1",
    ClassType.BUSINESS: "2",
    ClassType.FIRST: "3",
    ClassType.ECONOMYPLUS: "4",
    ClassType.PRIVATE: "5",
}

PURPOSE_TO_FR24 = {
    FlightPurpose.LEISURE: "1",
    FlightPurpose.BUSINESS: "2",
    FlightPurpose.CREW: "3",
    FlightPurpose.OTHER: "4",
}


class FR24Client:
    BASE = "https://my.flightradar24.com"
    LOGIN_URL = "https://www.flightradar24.com/user/login"

    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
        self._airport_cache: dict[str, dict | None] = {}
        self._airline_cache: dict[str, dict | None] = {}

    def login(self) -> None:
        # Step 1: authenticate on flightradar24.com
        resp = self.session.post(self.LOGIN_URL, data={
            "email": self.email,
            "password": self.password,
        })
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success"):
            raise RuntimeError("FR24 login failed — check email/password")

        # Step 2: establish session on my.flightradar24.com
        resp = self.session.get(f"{self.BASE}/sign-in")
        resp.raise_for_status()

    def _search_airport(self, term: str) -> dict | None:
        if term in self._airport_cache:
            return self._airport_cache[term]

        resp = self.session.get(f"{self.BASE}/add-flight/search/airport/", params={"term": term})
        resp.raise_for_status()
        results = resp.json()
        hit = results[0] if results else None
        self._airport_cache[term] = hit
        return hit

    def search_airport(self, airport: AirportModel | str) -> dict | None:
        if isinstance(airport, AirportModel):
            # try IATA first, fall back to ICAO
            if airport.iata:
                hit = self._search_airport(airport.iata)
                if hit:
                    return hit
            return self._search_airport(airport.icao)
        return self._search_airport(airport)

    def _search_airline(self, term: str) -> dict | None:
        if term in self._airline_cache:
            return self._airline_cache[term]

        resp = self.session.get(f"{self.BASE}/add-flight/search/airline/", params={"term": term})
        resp.raise_for_status()
        results = resp.json()
        hit = results[0] if results else None
        self._airline_cache[term] = hit
        return hit

    def search_airline(self, airline: AirlineModel | str | None) -> dict | None:
        if airline is None:
            return None
        if isinstance(airline, AirlineModel):
            if airline.iata:
                hit = self._search_airline(airline.iata)
                if hit:
                    return hit
            return self._search_airline(airline.icao)
        return self._search_airline(airline)

    def _get_user_id(self) -> str:
        """Extract userId from the add-flight page (required hidden field)."""
        if not hasattr(self, "_user_id"):
            import re
            resp = self.session.get(f"{self.BASE}/add-flight")
            resp.raise_for_status()
            match = re.search(r'name="userId"\s+value="(\d+)"', resp.text)
            if not match:
                raise RuntimeError("Could not find userId on add-flight page")
            self._user_id = match.group(1)
        return self._user_id

    def add_flight(self, flight: FlightModel, airline_override: str | None = None) -> None:
        assert isinstance(flight.origin, AirportModel)
        assert isinstance(flight.destination, AirportModel)

        origin_hit = self.search_airport(flight.origin)
        dest_hit = self.search_airport(flight.destination)
        airline_hit = self.search_airline(flight.airline or airline_override)

        if not origin_hit or not dest_hit:
            raise RuntimeError(
                f"Could not resolve airports: origin={flight.origin}, destination={flight.destination}"
            )

        dep_hour, dep_min = (flight.departure_time.split(":") if flight.departure_time else ("", ""))
        arr_hour, arr_min = (flight.arrival_time.split(":") if flight.arrival_time else ("", ""))

        dur_hour, dur_min = "", ""
        if flight.duration is not None:
            dur_hour = str(flight.duration // 60)
            dur_min = str(flight.duration % 60)

        user_id = self._get_user_id()

        data = {
            "userId": user_id,
            "departure-date": flight.date.isoformat(),
            "flight-number": flight.flight_number or "",
            "departure-airport": origin_hit["label"],
            "departure-airport-value": origin_hit["id"],
            "departure-time-hour": dep_hour,
            "departure-time-minute": dep_min,
            "arrival-airport": dest_hit["label"],
            "arrival-airport-value": arrival_hit_id if (arrival_hit_id := dest_hit["id"]) else "",
            "arrival-time-hour": arr_hour,
            "arrival-time-minute": arr_min,
            "duration-hour": dur_hour,
            "duration-minute": dur_min,
            "airline": airline_hit["label"] if airline_hit else "",
            "airline-value": airline_hit["id"] if airline_hit else "",
            "aircraft": flight.airplane or "",
            "aircraft-value": "",
            "aircraft-reg": flight.tail_number or "",
            "seat-number": "",
            "flight-class": CLASS_TYPE_TO_FR24.get(flight.ticket_class, ""),
            "flight-seat": SEAT_TYPE_TO_FR24.get(flight.seat, ""),
            "flight-reason": PURPOSE_TO_FR24.get(flight.purpose, ""),
            "flight-comment": (flight.notes or "").replace("\n", " "),
            "PostToTwitter": "0",
            "automatic-updates": "",
            "hasUploadedCSV": "false",
        }

        resp = self.session.post(f"{self.BASE}/add-flight", data=data)
        resp.raise_for_status()
