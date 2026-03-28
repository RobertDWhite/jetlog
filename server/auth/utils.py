from server.models import User
from server.db.session import SessionLocal
from server.db.models import User as UserModel

from fastapi.security import OAuth2PasswordBearer
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

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
