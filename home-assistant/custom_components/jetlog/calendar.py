"""Calendar of every flight in Jetlog."""

from __future__ import annotations

from datetime import datetime, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import Flight, JetlogConfigEntry
from .entity import JetlogEntity


async def async_setup_entry(hass: HomeAssistant, entry: JetlogConfigEntry,
                            async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([JetlogCalendar(entry.runtime_data, "flights")])


def _event(flight: Flight) -> CalendarEvent:
    a = flight.attributes()
    lines = [f"{a['airline'] or ''} {a['flight_number'] or ''}".strip(),
             f"{a['origin_name']} → {a['destination_name']}"]
    if a.get("aircraft"):
        lines.append(f"Aircraft: {a['aircraft']}" + (f" ({a['registration'] or a['tail_number']})"
                                                   if a.get("registration") or a.get("tail_number") else ""))
    if a.get("seat_number") or a.get("ticket_class"):
        lines.append(f"Seat: {a.get('seat_number') or a.get('seat') or '?'} · {a.get('ticket_class') or ''}".rstrip(" ·"))
    if a.get("status_text"):
        lines.append(f"Status: {a['status_text']}")
    if a.get("departure_delay_min") is not None:
        lines.append(f"Departure delay: {a['departure_delay_min']} min")
    if a.get("arrival_delay_min") is not None:
        lines.append(f"Arrival delay: {a['arrival_delay_min']} min")

    if flight.has_times:
        start, end = flight.best_departure, flight.best_arrival
    else:
        start = flight.departure.date()
        end = start + timedelta(days=1)
    return CalendarEvent(
        start=start,
        end=end,
        summary=f"✈ {flight.title}",
        description="\n".join(lines),
        location=a["origin_name"],
        uid=f"jetlog-{flight.id}",
    )


class JetlogCalendar(JetlogEntity, CalendarEntity):
    """Past and upcoming flights."""

    @property
    def event(self) -> CalendarEvent | None:
        flight = self.coordinator.data.current_or_next
        return _event(flight) if flight else None

    async def async_get_events(self, hass: HomeAssistant, start_date: datetime,
                               end_date: datetime) -> list[CalendarEvent]:
        events = []
        for flight in self.coordinator.data.flights:
            begin, finish = flight.best_departure, flight.best_arrival
            if flight.has_times and begin < end_date and finish > start_date:
                events.append(_event(flight))
            elif not flight.has_times and start_date.date() <= begin.date() <= end_date.date():
                events.append(_event(flight))
        return events
