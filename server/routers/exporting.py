from server.models import AirportModel, AirlineModel, FlightModel, SeatType, ClassType, FlightPurpose, User
from server.routers.flights import get_flights
from server.auth.users import get_current_user

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, HTMLResponse
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

@router.post("/kml", status_code=200)
async def export_to_KML(user: User = Depends(get_current_user)) -> FileResponse:
    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list

    file = open("/tmp/jetlog.kml", "w")
    file.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    file.write('<kml xmlns="http://www.opengis.net/kml/2.2">\n')
    file.write('<Document>\n')
    file.write('  <name>JetLog Flights</name>\n')

    # Styles
    file.write('  <Style id="flightRoute">\n')
    file.write('    <LineStyle><color>ff3355ff</color><width>2</width></LineStyle>\n')
    file.write('  </Style>\n')
    file.write('  <Style id="airport">\n')
    file.write('    <IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon></IconStyle>\n')
    file.write('  </Style>\n')

    # Collect unique airports
    airports_seen = {}

    for flight in flights:
        assert type(flight.origin) == AirportModel
        assert type(flight.destination) == AirportModel

        origin_code = flight.origin.iata or flight.origin.icao
        dest_code = flight.destination.iata or flight.destination.icao

        # Track airports
        if flight.origin.icao not in airports_seen:
            airports_seen[flight.origin.icao] = flight.origin
        if flight.destination.icao not in airports_seen:
            airports_seen[flight.destination.icao] = flight.destination

        # Flight route as a LineString
        airline_name = ""
        if isinstance(flight.airline, AirlineModel):
            airline_name = flight.airline.name
        flight_num = flight.flight_number or ""

        file.write('  <Placemark>\n')
        file.write(f'    <name>{origin_code} to {dest_code}</name>\n')
        file.write(f'    <description>{flight.date} {flight_num} {airline_name}</description>\n')
        file.write('    <styleUrl>#flightRoute</styleUrl>\n')
        file.write('    <LineString>\n')
        file.write('      <tessellate>1</tessellate>\n')
        file.write(f'      <coordinates>{flight.origin.longitude},{flight.origin.latitude},0 {flight.destination.longitude},{flight.destination.latitude},0</coordinates>\n')
        file.write('    </LineString>\n')
        file.write('  </Placemark>\n')

    # Airport markers
    for icao, airport in airports_seen.items():
        code = airport.iata or airport.icao
        file.write('  <Placemark>\n')
        file.write(f'    <name>{code} - {airport.municipality or airport.name}</name>\n')
        file.write('    <styleUrl>#airport</styleUrl>\n')
        file.write(f'    <Point><coordinates>{airport.longitude},{airport.latitude},0</coordinates></Point>\n')
        file.write('  </Placemark>\n')

    file.write('</Document>\n')
    file.write('</kml>\n')
    file.close()

    return FileResponse("/tmp/jetlog.kml",
                        background=BackgroundTask(cleanup, "/tmp/jetlog.kml"),
                        filename="jetlog.kml",
                        media_type="application/vnd.google-earth.kml+xml")

@router.post("/pdf", status_code=200)
async def export_to_pdf(user: User = Depends(get_current_user)) -> HTMLResponse:
    flights = await get_flights(limit=-1, user=user)
    assert type(flights) == list

    total_distance = sum(f.distance or 0 for f in flights)
    total_duration = sum(f.duration or 0 for f in flights)
    airports = set()
    countries = set()
    for f in flights:
        assert type(f.origin) == AirportModel
        assert type(f.destination) == AirportModel
        airports.add(f.origin.icao)
        airports.add(f.destination.icao)
        if f.origin.country: countries.add(f.origin.country)
        if f.destination.country: countries.add(f.destination.country)

    dur_h = total_duration // 60
    dur_m = total_duration % 60

    rows = ""
    for f in flights:
        assert type(f.origin) == AirportModel
        assert type(f.destination) == AirportModel
        origin_code = f.origin.iata or f.origin.icao
        dest_code = f.destination.iata or f.destination.icao
        airline_name = f.airline.name if isinstance(f.airline, AirlineModel) else (f.airline or "")
        rows += f"""<tr>
            <td>{f.date}</td>
            <td>{origin_code}</td><td>{f.origin.municipality or ""}</td>
            <td>{dest_code}</td><td>{f.destination.municipality or ""}</td>
            <td>{f.departure_time or ""}</td><td>{f.arrival_time or ""}</td>
            <td>{f.duration or ""}</td><td>{f.distance or ""}</td>
            <td>{airline_name}</td><td>{f.airplane or ""}</td>
            <td>{f.flight_number or ""}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>JetLog Flight Log</title>
<style>
    body {{ font-family: -apple-system, Arial, sans-serif; margin: 2em; color: #222; }}
    h1 {{ color: #2563eb; margin-bottom: 0.2em; }}
    .stats {{ display: flex; gap: 2em; margin: 1em 0 2em; flex-wrap: wrap; }}
    .stat {{ background: #f0f4ff; padding: 0.8em 1.2em; border-radius: 8px; }}
    .stat-value {{ font-size: 1.3em; font-weight: bold; color: #2563eb; }}
    .stat-label {{ font-size: 0.85em; color: #666; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 0.8em; }}
    th {{ background: #2563eb; color: white; padding: 6px 8px; text-align: left; }}
    td {{ padding: 4px 8px; border-bottom: 1px solid #ddd; }}
    tr:nth-child(even) {{ background: #f8f9fa; }}
    .footer {{ margin-top: 2em; font-size: 0.8em; color: #999; }}
    @media print {{ body {{ margin: 0.5em; }} .stat {{ background: #f0f4ff !important; -webkit-print-color-adjust: exact; }} }}
</style></head><body>
<h1>Flight Log</h1>
<p style="color:#666">{user.username} &mdash; exported {datetime.date.today().isoformat()}</p>
<div class="stats">
    <div class="stat"><div class="stat-value">{len(flights)}</div><div class="stat-label">Flights</div></div>
    <div class="stat"><div class="stat-value">{total_distance:,} km</div><div class="stat-label">Distance</div></div>
    <div class="stat"><div class="stat-value">{dur_h}h {dur_m}m</div><div class="stat-label">Time in Air</div></div>
    <div class="stat"><div class="stat-value">{len(airports)}</div><div class="stat-label">Airports</div></div>
    <div class="stat"><div class="stat-value">{len(countries)}</div><div class="stat-label">Countries</div></div>
</div>
<table>
<tr><th>Date</th><th>From</th><th>City</th><th>To</th><th>City</th><th>Dep</th><th>Arr</th><th>Min</th><th>km</th><th>Airline</th><th>Aircraft</th><th>Flight#</th></tr>
{rows}
</table>
<div class="footer">Generated by JetLog &mdash; Use File &gt; Print &gt; Save as PDF</div>
</body></html>"""

    return HTMLResponse(content=html)
