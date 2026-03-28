"""Thin compatibility layer over SQLAlchemy sessions.

This module preserves the `database` singleton import that many modules
rely on, but delegates all work to SQLAlchemy sessions from server.db.session.
The execute_query / execute_read_query methods accept raw SQL strings with
'?' placeholders (sqlite3 style) which are converted to SQLAlchemy text() objects.
"""

from sqlalchemy import text
from fastapi import HTTPException

from server.db.session import SessionLocal


def _convert_placeholders(query: str) -> str:
    """Convert sqlite3-style '?' placeholders to SQLAlchemy ':pN' named params."""
    result = []
    param_index = 0
    i = 0
    while i < len(query):
        if query[i] == '?':
            result.append(f":p{param_index}")
            param_index += 1
        else:
            result.append(query[i])
        i += 1
    return "".join(result)


def _make_param_dict(parameters: list) -> dict:
    """Convert a list of parameters to a dict keyed by :pN."""
    return {f"p{i}": v for i, v in enumerate(parameters)}


class Database:
    """Compatibility wrapper that provides execute_query/execute_read_query
    using SQLAlchemy sessions underneath."""

    def execute_query(self, query: str, parameters=None) -> tuple:
        if parameters is None:
            parameters = []
        try:
            with SessionLocal() as session:
                converted = _convert_placeholders(query)
                params = _make_param_dict(parameters)
                result = session.execute(text(converted), params)
                row = result.fetchone() if result.returns_rows else None
                session.commit()
                return tuple(row) if row else ()
        except Exception as err:
            raise HTTPException(status_code=500, detail="SQL error: " + str(err))

    def execute_read_query(self, query: str, parameters=None) -> list:
        if parameters is None:
            parameters = []
        try:
            with SessionLocal() as session:
                converted = _convert_placeholders(query)
                params = _make_param_dict(parameters)
                result = session.execute(text(converted), params)
                return [tuple(row) for row in result.fetchall()]
        except Exception as err:
            raise HTTPException(status_code=500, detail="SQL error: " + str(err))


# Module-level singleton, preserving the import pattern:
#   from server.database import database
database = Database()
