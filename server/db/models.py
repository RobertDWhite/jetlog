from sqlalchemy import (
    Column, Integer, Text, Float, DateTime, ForeignKey,
    CheckConstraint, func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    is_admin = Column(Integer, nullable=False, default=0)
    public_profile = Column(Integer, nullable=False, default=0)
    last_login = Column(DateTime, nullable=True)
    created_on = Column(DateTime, nullable=False, server_default=func.current_timestamp())

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"


class Flight(Base):
    __tablename__ = "flights"
    __table_args__ = (
        CheckConstraint("seat IN ('aisle', 'middle', 'window')", name="ck_flights_seat"),
        CheckConstraint("aircraft_side IN ('left', 'right', 'center')", name="ck_flights_aircraft_side"),
        CheckConstraint("ticket_class IN ('private', 'first', 'business', 'economy+', 'economy')", name="ck_flights_ticket_class"),
        CheckConstraint("purpose IN ('leisure', 'business', 'crew', 'other')", name="ck_flights_purpose"),
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_flights_rating"),
        CheckConstraint("connection IS NULL OR connection <> id", name="ck_flights_connection_not_self"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, nullable=False, default="admin")
    date = Column(Text, nullable=False)
    origin = Column(Text, nullable=False)
    destination = Column(Text, nullable=False)
    departure_time = Column(Text, nullable=True)
    arrival_time = Column(Text, nullable=True)
    arrival_date = Column(Text, nullable=True)
    seat = Column(Text, nullable=True)
    seat_number = Column(Text, nullable=True)
    aircraft_side = Column(Text, nullable=True)
    ticket_class = Column(Text, nullable=True)
    purpose = Column(Text, nullable=True)
    duration = Column(Integer, nullable=True)
    distance = Column(Integer, nullable=True)
    airplane = Column(Text, nullable=True)
    airline = Column(Text, nullable=True)
    tail_number = Column(Text, nullable=True)
    flight_number = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    cost = Column(Float, nullable=True)
    currency = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)
    connection = Column(Integer, ForeignKey("flights.id", ondelete="SET NULL"), nullable=True)

    connected_flight = relationship("Flight", remote_side=[id], foreign_keys=[connection])
    fr24_sync = relationship("FR24SyncedFlight", back_populates="flight", uselist=False,
                             cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Flight(id={self.id}, {self.origin}->{self.destination} on {self.date})>"


class Airport(Base):
    __tablename__ = "airports"

    icao = Column(Text, primary_key=True)
    iata = Column(Text, nullable=True)
    type = Column(Text, nullable=True)
    name = Column(Text, nullable=True)
    municipality = Column(Text, nullable=True)
    region = Column(Text, nullable=True)
    country = Column(Text, nullable=True)
    continent = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    timezone = Column(Text, nullable=True)

    def __repr__(self):
        return f"<Airport(icao='{self.icao}', name='{self.name}')>"


class Airline(Base):
    __tablename__ = "airlines"

    icao = Column(Text, primary_key=True)
    iata = Column(Text, nullable=True)
    name = Column(Text, nullable=True)

    def __repr__(self):
        return f"<Airline(icao='{self.icao}', name='{self.name}')>"


class FR24SyncedFlight(Base):
    __tablename__ = "fr24_synced_flights"

    flight_id = Column(Integer, ForeignKey("flights.id", ondelete="CASCADE"), primary_key=True)
    synced_at = Column(DateTime, server_default=func.current_timestamp())

    flight = relationship("Flight", back_populates="fr24_sync")

    def __repr__(self):
        return f"<FR24SyncedFlight(flight_id={self.flight_id})>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    username = Column(Text, nullable=False)
    action = Column(Text, nullable=False)
    flight_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action='{self.action}')>"


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, ForeignKey("users.username"), nullable=False)
    key_hash = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    last_used = Column(DateTime, nullable=True)
    is_active = Column(Integer, default=1)

    def __repr__(self):
        return f"<ApiKey(id={self.id}, name='{self.name}', username='{self.username}')>"


class FrequentFlyerEntry(Base):
    __tablename__ = "frequent_flyer_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    flight_id = Column(Integer, ForeignKey("flights.id", ondelete="CASCADE"), nullable=False)
    program_name = Column(Text, nullable=False)
    member_number = Column(Text, nullable=True)
    miles_earned = Column(Integer, default=0)
    status_credits = Column(Integer, default=0)

    def __repr__(self):
        return f"<FrequentFlyerEntry(id={self.id}, flight_id={self.flight_id}, program='{self.program_name}')>"


class CustomFieldDef(Base):
    __tablename__ = "custom_field_defs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, ForeignKey("users.username"), nullable=False)
    field_name = Column(Text, nullable=False)
    field_label = Column(Text, nullable=False)
    field_type = Column(Text, nullable=False)
    options = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)

    def __repr__(self):
        return f"<CustomFieldDef(id={self.id}, field_name='{self.field_name}')>"


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"

    id = Column(Integer, primary_key=True, autoincrement=True)
    flight_id = Column(Integer, ForeignKey("flights.id", ondelete="CASCADE"), nullable=False)
    field_def_id = Column(Integer, ForeignKey("custom_field_defs.id", ondelete="CASCADE"), nullable=False)
    value = Column(Text, nullable=True)

    def __repr__(self):
        return f"<CustomFieldValue(id={self.id}, flight_id={self.flight_id}, field_def_id={self.field_def_id})>"
