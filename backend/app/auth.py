"""User authentication: JWT tokens, password hashing, guest sessions.

Supports two authentication methods:
1. JWT Bearer token (Authorization header) — registered users
2. Signed cookie (volna_guest) — anonymous guest sessions (legacy)

If neither is present, a new guest user is created automatically.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import MemberRole, Room, RoomMember, User


COOKIE_NAME = "volna_guest"
COOKIE_MAX_AGE = 30 * 24 * 60 * 60
JWT_ALGORITHM = "HS256"

# Optional bearer — does NOT raise 403 when missing
_optional_bearer = HTTPBearer(auto_error=False)


# ── Password hashing ───────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))


# ── JWT helpers ─────────────────────────────────────────────────────────────

def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# ── Legacy cookie helpers ───────────────────────────────────────────────────

def _cookie_signature(user_id: uuid.UUID) -> str:
    return hmac.new(
        settings.session_secret.encode("utf-8"),
        str(user_id).encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def _decode_cookie(token: str | None) -> uuid.UUID | None:
    if not token or "." not in token:
        return None
    raw_id, signature = token.split(".", 1)
    try:
        user_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _cookie_signature(user_id)):
        return None
    return user_id


# ── Dependency: current user ────────────────────────────────────────────────

def get_current_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve current user from JWT, then cookie, then create a guest."""

    # 1. Try JWT Bearer token
    if credentials is not None:
        user_id = decode_access_token(credentials.credentials)
        if user_id is not None:
            user = db.get(User, user_id)
            if user is not None:
                return user
        raise HTTPException(status_code=401, detail="Недействительный токен")

    # 2. Try legacy cookie
    user_id = _decode_cookie(request.cookies.get(COOKIE_NAME))
    user = db.get(User, user_id) if user_id else None
    if user is not None:
        return user

    # 3. Create anonymous guest
    user = User(display_name="Новый слушатель")
    db.add(user)
    db.flush()

    base_room = db.scalar(select(Room).where(Room.name == "ИИНОД-82", Room.is_active.is_(True)))
    if base_room is not None:
        db.add(RoomMember(room_id=base_room.id, user_id=user.id, role=MemberRole.MEMBER))

    db.commit()
    db.refresh(user)
    token = f"{user.id}.{_cookie_signature(user.id)}"
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
    )
    return user


def require_registered_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Like get_current_user but raises 401 if user has no email/password."""
    user = get_current_user(request, response, credentials, db)
    if user.email is None:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return user
