from server.models import AirportModel, AirlineModel, FlightModel, SeatType, ClassType, FlightPurpose, User
from server.routers.flights import get_flights
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import os
import csv
import datetime

router = APIRouter(
    prefix="/exporting",
    tags=["importing/exporting"],
    redirect_slashes=True
)

def cleanup(file_path: str):
    os.remove(file_path)

def stringify_airport(airport: AirportModel) -> str:
    code = airport.iata if airport.iata else airport.icao
    return f"{code} - {airport.municipality}/{airport.country}"

@router.post("/csv", status_code=200)
async def export_to_CSV(user: User = Depends(get_current_user)) -> FileResponse:
    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list # make linter happy

    file = open("/tmp/jetlog.csv", 'w', newline='')
    csv_writer = csv.writer(file, quotechar='"', delimiter=',')
    columns = FlightModel.get_attributes(ignore=["id", "username", "connection"])

    csv_writer.writerow(columns)

    for flight in flights:
        values = [ str(val).replace("\n", "\\n") if val != None else '' for val in flight.get_values(ignore=["id", "username", "connection"]) ]
        csv_writer.writerow(values)

    file.close()
    return FileResponse("/tmp/jetlog.csv", 
                        background=BackgroundTask(cleanup, "/tmp/jetlog.csv"),
                        filename="jetlog.csv")

@router.post("/ical", status_code=200)
async def export_to_iCal(user: User = Depends(get_current_user)) -> FileResponse:
    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list # make linter happy

    file = open("/tmp/jetlog.ics", "a")

    file.write("BEGIN:VCALENDAR\n")
    file.write("CALSCALE:GREGORIAN\n")
    file.write("VERSION:2.0\n\n")

    for flight in flights:
        assert type(flight.origin) == AirportModel
        assert type(flight.destination) == AirportModel

        file.write("BEGIN:VEVENT\n")
        file.write(f"SUMMARY:Flight from {flight.origin.municipality} to {flight.destination.municipality}\n")
        file.write(f"DESCRIPTION:Origin: {stringify_airport(flight.origin)}\\n" +
                               f"Destination: {stringify_airport(flight.destination)}" +
                               (f"\\n\\nNotes: {flight.notes}" if flight.notes else "") +
                                "\n")

        if flight.departure_time and flight.duration:
            departure = datetime.datetime.strptime(f"{flight.date} {flight.departure_time}", "%Y-%m-%d %H:%M")
            arrival = departure + datetime.timedelta(minutes=flight.duration)

            file.write(f"DTSTART:{departure.strftime('%Y%m%dT%H%M00')}\n")
            file.write(f"DTEND:{arrival.strftime('%Y%m%dT%H%M00')}\n")
        elif flight.date:
            date = flight.date.strftime('%Y%m%d')
            file.write(f"DTSTART;VALUE=DATE:{date}\n")
            file.write(f"DTEND;VALUE=DATE:{date}\n")

        file.write("END:VEVENT\n\n")

    file.write("END:VCALENDAR")

    file.close()
    return FileResponse("/tmp/jetlog.ics",
                        background=BackgroundTask(cleanup, "/tmp/jetlog.ics"),
                        filename="jetlog.ics")

def format_mfr24_airport(airport: AirportModel) -> str:
    name = airport.municipality if airport.municipality else airport.name
    return f"{name} ({airport.icao})"

def format_mfr24_airline(airline) -> str:
    if airline is None:
        return " (/)"
    if isinstance(airline, AirlineModel):
        return f"{airline.name} ({airline.icao})"
    # string (ICAO code only) — wrap in the expected format
    return f" ({airline})"

def format_mfr24_duration(minutes: int|None) -> str:
    if minutes is None:
        return ""
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}:00"

SEAT_TYPE_TO_MFR24 = {
    SeatType.WINDOW: "1",
    SeatType.MIDDLE: "2",
    SeatType.AISLE: "3",
}

CLASS_TYPE_TO_MFR24 = {
    ClassType.ECONOMY: "1",
    ClassType.BUSINESS: "2",
    ClassType.FIRST: "3",
    ClassType.ECONOMYPLUS: "4",
    ClassType.PRIVATE: "5",
}

PURPOSE_TO_MFR24 = {
    FlightPurpose.LEISURE: "1",
    FlightPurpose.BUSINESS: "2",
    FlightPurpose.CREW: "3",
    FlightPurpose.OTHER: "4",
}

@router.post("/myflightradar24", status_code=200)
async def export_to_myflightradar24(user: User = Depends(get_current_user)) -> FileResponse:
    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list

    file = open("/tmp/jetlog_mfr24.csv", 'w', newline='')
    csv_writer = csv.writer(file, quotechar='"', delimiter=',')

    columns = ["Date", "Flight number", "From", "To", "Dep time", "Arr time",
               "Duration", "Airline", "Aircraft", "Registration", "Seat number",
               "Seat type", "Flight class", "Flight reason", "Note", "Dep_id",
               "Arr_id", "Airline_id", "Aircraft_id"]
    csv_writer.writerow(columns)

    for flight in flights:
        assert type(flight.origin) == AirportModel
        assert type(flight.destination) == AirportModel

        row = [
            flight.date.isoformat(),
            flight.flight_number or "",
            format_mfr24_airport(flight.origin),
            format_mfr24_airport(flight.destination),
            flight.departure_time or "",
            flight.arrival_time or "",
            format_mfr24_duration(flight.duration),
            format_mfr24_airline(flight.airline),
            flight.airplane or " ()",
            flight.tail_number or "",
            "",  # Seat number (not tracked in JetLog)
            SEAT_TYPE_TO_MFR24.get(flight.seat, "0"),
            CLASS_TYPE_TO_MFR24.get(flight.ticket_class, "0"),
            PURPOSE_TO_MFR24.get(flight.purpose, "0"),
            (flight.notes or "").replace("\n", " "),
            "",  # Dep_id (internal FR24 ID)
            "",  # Arr_id
            "",  # Airline_id
            "",  # Aircraft_id
        ]
        csv_writer.writerow(row)

    file.close()
    return FileResponse("/tmp/jetlog_mfr24.csv",
                        background=BackgroundTask(cleanup, "/tmp/jetlog_mfr24.csv"),
                        filename="jetlog_myflightradar24.csv")
