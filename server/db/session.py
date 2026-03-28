import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session

from server.environment import DATA_PATH
from server.db.models import Base, Airport, Airline

DB_PATH = os.path.join(DATA_PATH, "jetlog.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency that yields a SQLAlchemy session and auto-closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """Context manager for non-FastAPI code that needs a session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _update_tables():
    """Reimport airports and airlines from the bundled .db files."""
    print("Updating airports and airlines tables...")
    airports_db_path = Path(__file__).parent.parent.parent / 'data' / 'airports.db'
    airlines_db_path = Path(__file__).parent.parent.parent / 'data' / 'airlines.db'

    # Use a direct sqlite3 connection to avoid SQLAlchemy transaction conflicts
    # with ATTACH/DETACH commands. isolation_level=None for autocommit mode
    # which is required for ATTACH/DETACH to work without transaction conflicts.
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("DELETE FROM airports")
        conn.execute("DELETE FROM airlines")

        conn.execute(f"ATTACH DATABASE '{airports_db_path}' AS ap")
        conn.execute(f"ATTACH DATABASE '{airlines_db_path}' AS ar")

        conn.execute("INSERT INTO main.airports SELECT * FROM ap.airports")
        conn.execute("INSERT INTO main.airlines SELECT * FROM ar.airlines")

        conn.execute("DETACH DATABASE ap")
        conn.execute("DETACH DATABASE ar")
    finally:
        conn.close()


def _patch_table_if_needed():
    """Check if flights and users tables need schema migration (backward compatibility).

    This handles the case where an older database is missing columns that were
    added in newer versions. We compare existing columns against the ORM model
    and add any missing columns with ALTER TABLE.
    """
    from server.db.models import Flight, User as UserModel

    table_models = {
        "flights": Flight,
        "users": UserModel,
    }

    with SessionLocal() as session:
        for table_name, model_cls in table_models.items():
            result = session.execute(text(f"PRAGMA table_info({table_name})"))
            rows = result.fetchall()
            existing_columns = {row[1] for row in rows}

            if not existing_columns:
                # Table doesn't exist yet - will be created by create_all
                continue

            for col in model_cls.__table__.columns:
                if col.name not in existing_columns:
                    print(f"Detected missing column '{col.name}' in table '{table_name}'. Adding it...")
                    col_type = str(col.type)
                    default_clause = ""
                    if col.default is not None:
                        if hasattr(col.default, 'arg'):
                            default_val = col.default.arg
                            if isinstance(default_val, str):
                                default_clause = f" DEFAULT '{default_val}'"
                            else:
                                default_clause = f" DEFAULT {default_val}"
                    nullable = "" if col.nullable else " NOT NULL"
                    # SQLite ALTER TABLE ADD COLUMN requires a default for NOT NULL columns
                    if not col.nullable and not default_clause:
                        if col_type.upper() in ("INTEGER", "FLOAT", "REAL"):
                            default_clause = " DEFAULT 0"
                        else:
                            default_clause = " DEFAULT ''"
                    session.execute(text(
                        f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{nullable}{default_clause}"
                    ))
            session.commit()


def _create_first_user():
    """Create the default admin:admin user."""
    from server.auth.utils import hash_password
    from server.db.models import User as UserModel

    print("Creating first user admin:admin...")
    print("REMEMBER TO CHANGE THE DEFAULT PASSWORD FOR THIS USER!!!")

    with SessionLocal() as session:
        existing = session.query(UserModel).filter(UserModel.username == "admin").first()
        if existing:
            return

        admin = UserModel(
            username="admin",
            password_hash=hash_password("admin"),
            is_admin=1,
        )
        session.add(admin)
        session.commit()


def init_db():
    """Initialize the database: create tables, run migrations, import reference data."""
    print("Initializing database connection")

    db_exists = os.path.isfile(DB_PATH)

    # Create all tables that don't exist yet
    Base.metadata.create_all(bind=engine)

    if db_exists:
        # Patch existing tables for backward compatibility
        _patch_table_if_needed()
    else:
        print("Database file not found, creating it...")
        _create_first_user()

    # Always update airports and airlines from bundled data
    _update_tables()

    # Ensure first user exists (handles migration from pre-user databases)
    if db_exists:
        with SessionLocal() as session:
            from server.db.models import User as UserModel
            user_count = session.query(UserModel).count()
            if user_count == 0:
                session.close()
                _create_first_user()

    print("Database initialization complete")
