from server.db.session import get_db
from server.db.models import User as UserModel
from server.auth.utils import verify_password, get_user
from server.environment import SECRET_KEY, TOKEN_DURATION

import jwt
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
    redirect_slashes=True
)

ALGORITHM = "HS256"

class Token(BaseModel):
    access_token: str
    token_type: str

def create_access_token(data: dict):
    to_encode = data.copy()

    # set expiration
    expire = datetime.utcnow() + timedelta(days=TOKEN_DURATION)
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def update_last_login(username: str, db: Session) -> None:
    db.query(UserModel).filter(UserModel.username == username).update(
        {UserModel.last_login: datetime.utcnow()}
    )
    db.commit()

@router.post("/token", status_code=200)
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
                db: Session = Depends(get_db)) -> Token:
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401,
                            headers={"WWW-Authenticate": "Bearer"},
                            detail="Incorrect username or password")

    update_last_login(user.username, db)

    access_token = create_access_token({"sub": user.username})
    return Token(access_token=access_token, token_type="bearer")
