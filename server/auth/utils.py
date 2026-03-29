import hashlib

from server.models import User
from server.db.session import SessionLocal
from server.db.models import User as UserModel, ApiKey

from fastapi.security import OAuth2PasswordBearer
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import func
from sqlalchemy.orm import Session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)
_ph = PasswordHasher()

def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerificationError:
        return False

def hash_password(password: str) -> str:
    password_hash = _ph.hash(password)
    return password_hash

def hash_api_key(raw_key: str) -> str:
    """Hash an API key using SHA256."""
    return hashlib.sha256(raw_key.encode()).hexdigest()

def get_user(username: str) -> User|None:
    with SessionLocal() as session:
        db_user = session.query(UserModel).filter(UserModel.username == username).first()

        if not db_user:
            return None

        user = User(
            id=db_user.id,
            username=db_user.username,
            password_hash=db_user.password_hash,
            is_admin=bool(db_user.is_admin),
            public_profile=bool(db_user.public_profile),
            last_login=db_user.last_login,
            created_on=db_user.created_on,
        )
        return User.model_validate(user)

def get_user_from_api_key(raw_key: str, db: Session) -> User|None:
    """Look up a user by API key. Updates last_used timestamp if found."""
    key_hash = hash_api_key(raw_key)
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash,
        ApiKey.is_active == 1,
    ).first()

    if not api_key:
        return None

    # Update last_used timestamp
    api_key.last_used = func.current_timestamp()
    db.commit()

    return get_user(api_key.username)
