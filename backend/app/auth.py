"""Lightweight signed guest sessions for the hackathon prototype."""

from __future__ import annotations

import hashlib
import hmac
import uuid

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User


COOKIE_NAME = "volna_guest"
COOKIE_MAX_AGE = 30 * 24 * 60 * 60


def _signature(user_id: uuid.UUID) -> str:
    return hmac.new(
        settings.session_secret.encode("utf-8"),
        str(user_id).encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def _decode(token: str | None) -> uuid.UUID | None:
    if not token or "." not in token:
        return None
    raw_id, signature = token.split(".", 1)
    try:
        user_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _signature(user_id)):
        return None
    return user_id


def get_current_user(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    """Return a signed guest identity, creating it on the first request."""

    user_id = _decode(request.cookies.get(COOKIE_NAME))
    user = db.get(User, user_id) if user_id else None
    if user is None:
        user = User(display_name="Новый слушатель")
        db.add(user)
        db.commit()
        db.refresh(user)
        token = f"{user.id}.{_signature(user.id)}"
        response.set_cookie(
            COOKIE_NAME,
            token,
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=False,
        )
    return user
