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


get_password_hash = hash_password


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
    """Strictly resolve current user from JWT Bearer token or existing cookie.
    
    Raises 401 Unauthorized if not authenticated.
    """
    # 1. Try JWT Bearer token
    if credentials is not None:
        user_id = decode_access_token(credentials.credentials)
        if user_id is not None:
            user = db.get(User, user_id)
            if user is not None:
                return user
        raise HTTPException(status_code=401, detail="Недействительный токен авторизации")

    # 2. Try cookie
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        user_id = _decode_cookie(cookie_token)
        if user_id:
            user = db.get(User, user_id)
            if user is not None and (user.email is not None or user.password_hash is not None):
                return user

    # 3. No guest fallback — strict auth gate!
    raise HTTPException(status_code=401, detail="Требуется авторизация для доступа к платформе")


def require_registered_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Equivalent to get_current_user."""
    return get_current_user(request, response, credentials, db)


def require_superuser(user: User = Depends(get_current_user)) -> User:
    """Check that current user has superuser privileges."""
    if not getattr(user, "is_superuser", False):
        raise HTTPException(status_code=403, detail="Доступ запрещен. Требуются права глобального администратора.")
    return user
