import secrets
from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.db.session import get_db
from server.db.models import ApiKey
from server.auth.utils import hash_api_key
from server.auth.users import get_current_user
from server.models import User

router = APIRouter(
    prefix="/api-keys",
    tags=["api-keys"],
    redirect_slashes=True,
)


class ApiKeyCreate(BaseModel):
    name: str


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    created_at: datetime | None = None
    last_used: datetime | None = None
    is_active: bool

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(BaseModel):
    id: int
    name: str
    key: str  # Raw key, shown only once


@router.post("", status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiKeyCreatedResponse:
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="API key name is required")

    raw_key = secrets.token_hex(32)  # 64-char hex string
    key_hash = hash_api_key(raw_key)

    api_key = ApiKey(
        username=user.username,
        key_hash=key_hash,
        name=body.name.strip(),
        is_active=1,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key=raw_key,
    )


@router.get("")
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ApiKeyResponse]:
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.username == user.username)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return [
        ApiKeyResponse(
            id=k.id,
            name=k.name,
            created_at=k.created_at,
            last_used=k.last_used,
            is_active=bool(k.is_active),
        )
        for k in keys
    ]


@router.delete("/{key_id}", status_code=200)
async def deactivate_api_key(
    key_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    api_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.username == user.username,
    ).first()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = 0
    db.commit()

    return {"status": "deactivated", "id": key_id}
