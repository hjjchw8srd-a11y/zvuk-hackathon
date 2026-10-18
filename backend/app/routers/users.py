import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, MemberRole, Room, RoomMember, Track, User
from app.schemas import ProfileUpdate, UserOut

router = APIRouter(tags=["users"])


def _clean(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return re.sub(r"\s+", " ", value).strip()[:limit]


# ── /api/me — Текущий пользователь и его данные ────────────────────────────

@router.get("/api/me", response_model=UserOut)
@router.get("/api/me/profile", response_model=UserOut)
def get_my_profile(user: User = Depends(get_current_user)):
    """Получить профиль текущего пользователя."""
    return user


@router.patch("/api/me/profile")
def update_my_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Обновить профиль текущего пользователя (имя, аватарку)."""
    if payload.display_name is not None:
        user.display_name = _clean(payload.display_name, 60)
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url.strip() or None
    db.commit()
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
    }


@router.get("/api/me/communities")
def get_my_communities(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить список плейлистов пользователя (созданные им и те, где он участник)."""
    memberships = db.execute(
        select(Room, RoomMember.role, RoomMember.joined_at)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(RoomMember.user_id == user.id, Room.is_active.is_(True))
        .order_by(RoomMember.joined_at.desc())
    ).all()

    created = []
    joined = []

    for room, role, joined_at in memberships:
        member_count = db.scalar(
            select(func.count()).select_from(RoomMember).where(RoomMember.room_id == room.id)
        )
        community_info = {
            "id": room.id,
            "name": room.name,
            "faculty": room.faculty,
            "description": room.description,
            "avatar_url": room.avatar_url,
            "external_link": room.external_link,
            "invite_code": room.invite_code,
            "owner_id": room.owner_id,
            "role": role.value,
            "member_count": member_count,
            "created_at": room.created_at,
            "joined_at": joined_at,
        }
        if role == MemberRole.OWNER:
            created.append(community_info)
        else:
            joined.append(community_info)

    return {
        "created": created,
        "joined": joined,
        "total": len(created) + len(joined),
    }


@router.get("/api/me/tracks")
def get_my_tracks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить список всей добавленной пользователем музыки со статусами."""
    tracks_with_rooms = db.execute(
        select(Track, Room.name.label("room_name"))
        .join(Room, Room.id == Track.room_id)
        .where(Track.created_by_user_id == user.id)
        .order_by(Track.created_at.desc())
    ).all()

    return {
        "tracks": [
            {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "genre": track.genre,
                "duration_seconds": track.duration_seconds,
                "source_type": track.source_type.value,
                "library_key": track.library_key,
                "moderation_status": track.moderation_status.value,
                "room_id": track.room_id,
                "room_name": room_name,
                "created_at": track.created_at,
            }
            for track, room_name in tracks_with_rooms
        ],
        "count": len(tracks_with_rooms),
    }


@router.get("/api/me/favorites")
def get_my_favorites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Получить список избранных треков пользователя."""
    favorites_with_tracks = db.execute(
        select(Track, Room.name.label("room_name"))
        .join(Favorite, Favorite.track_id == Track.id)
        .join(Room, Room.id == Track.room_id)
        .where(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc())
    ).all()

    return {
        "favorites": [
            {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "genre": track.genre,
                "duration_seconds": track.duration_seconds,
                "source_type": track.source_type.value,
                "library_key": track.library_key,
                "room_id": track.room_id,
                "room_name": room_name,
                "created_at": track.created_at,
            }
            for track, room_name in favorites_with_tracks
        ],
        "count": len(favorites_with_tracks),
    }


# ── /api/users — Базовый CRUD пользователей ────────────────────────────────

@router.get("/api/users/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    """Получить список всех пользователей."""
    return db.query(User).all()


@router.post("/api/users/", response_model=UserOut, status_code=201)
def create_user(db: Session = Depends(get_db)):
    """Создать нового пользователя."""
    user = User()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/api/users/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Получить пользователя по ID."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Удалить пользователя по ID."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    db.delete(user)
    db.commit()
