import requests

from server.models import AirportModel, AirlineModel, FlightModel, SeatType, ClassType, FlightPurpose


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
        if not body.get("userData", {}).get("id"):
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

    def add_flight(self, flight: FlightModel) -> None:
        assert isinstance(flight.origin, AirportModel)
        assert isinstance(flight.destination, AirportModel)

        origin_hit = self.search_airport(flight.origin)
        dest_hit = self.search_airport(flight.destination)
        airline_hit = self.search_airline(flight.airline)

        if not origin_hit or not dest_hit:
            raise RuntimeError(
                f"Could not resolve airports: origin={flight.origin}, destination={flight.destination}"
            )

        def format_duration(minutes: int | None) -> str:
            if minutes is None:
                return ""
            h = minutes // 60
            m = minutes % 60
            return f"{h:02d}:{m:02d}:00"

        data = {
            "flight[date]": flight.date.isoformat(),
            "flight[number]": flight.flight_number or "",
            "flight[from]": origin_hit["label"],
            "flight[from_id]": origin_hit["id"],
            "flight[to]": dest_hit["label"],
            "flight[to_id]": dest_hit["id"],
            "flight[dep_time]": flight.departure_time or "",
            "flight[arr_time]": flight.arrival_time or "",
            "flight[duration]": format_duration(flight.duration),
            "flight[airline]": airline_hit["label"] if airline_hit else "",
            "flight[airline_id]": airline_hit["id"] if airline_hit else "",
            "flight[aircraft]": flight.airplane or "",
            "flight[aircraft_id]": "",
            "flight[registration]": flight.tail_number or "",
            "flight[seat_number]": "",
            "flight[seat_type]": SEAT_TYPE_TO_FR24.get(flight.seat, "0"),
            "flight[class]": CLASS_TYPE_TO_FR24.get(flight.ticket_class, "0"),
            "flight[reason]": PURPOSE_TO_FR24.get(flight.purpose, "0"),
            "flight[note]": (flight.notes or "").replace("\n", " "),
        }

        resp = self.session.post(f"{self.BASE}/add-flight", data=data)
        resp.raise_for_status()
