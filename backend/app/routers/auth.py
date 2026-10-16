"""Authentication endpoints: register, login, current user."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Зарегистрировать нового пользователя по email и паролю."""
    email_lower = payload.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email_lower))
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="Пользователь с таким email уже существует"
        )

    user = User(
        email=email_lower,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Войти по email и паролю, получить JWT токен."""
    email_lower = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email_lower))
    if user is None or user.password_hash is None:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    """Получить данные текущего пользователя."""
    return user
