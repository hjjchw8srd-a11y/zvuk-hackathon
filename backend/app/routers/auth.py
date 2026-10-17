"""Authentication endpoints: register, login, current user."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import MemberRole, Room, RoomMember, User
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Зарегистрировать нового пользователя по username/email и паролю."""
    clean_username = payload.username.strip()
    if len(clean_username) < 2:
        raise HTTPException(status_code=400, detail="Имя пользователя должно содержать минимум 2 символа")

    existing_username = db.scalar(
        select(User).where(func.lower(User.username) == clean_username.lower())
    )
    if existing_username is not None:
        raise HTTPException(
            status_code=409, detail="Пользователь с таким именем уже существует"
        )

    email_lower = (payload.email.strip().lower() if payload.email else f"{clean_username.lower()}@ritm.local")
    existing_email = db.scalar(select(User).where(User.email == email_lower))
    if existing_email is not None:
        raise HTTPException(
            status_code=409, detail="Пользователь с таким email уже существует"
        )

    disp_name = payload.display_name.strip() if payload.display_name else clean_username

    user = User(
        username=clean_username,
        email=email_lower,
        password_hash=hash_password(payload.password),
        display_name=disp_name,
        is_superuser=False,
    )
    db.add(user)
    db.flush()

    base_room = db.scalar(select(Room).where(Room.name == "ИИНОД-82", Room.is_active.is_(True)))
    if base_room is not None:
        db.add(RoomMember(room_id=base_room.id, user_id=user.id, role=MemberRole.MEMBER))

    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Войти по username/email и паролю, получить JWT токен."""
    ident = (payload.login or payload.email or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Укажите логин или email")

    ident_lower = ident.lower()
    user = db.scalar(
        select(User).where(
            (func.lower(User.email) == ident_lower) |
            (func.lower(User.username) == ident_lower)
        )
    )
    if user is None or user.password_hash is None:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    """Получить данные текущего пользователя."""
    return user
