"""HTTP API consumed by the Volna frontend."""

from __future__ import annotations

import asyncio
import difflib
import hashlib
import logging
import re
import secrets
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from io import BytesIO
import math
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from mutagen import File as MutagenFile
from mutagen import MutagenError
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user
from app.config import BACKEND_DIR, settings
from app.database import get_db
from app.network import frontend_base_url
from app.models import (
    BlacklistedTrack,
    Favorite,
    MemberRole,
    ModerationLog,
    ModerationStatus,
    PlaybackHistory,
    PlaylistRound,
    QueueItem,
    QueueItemState,
    Room,
    RoomMember,
    RoundStatus,
    RoundTopSnapshot,
    Track,
    TrackSource,
    User,
    Vote,
    VoteEvent,
)
from app.services import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    cast_vote,
    complete_current_and_play_next,
    create_playlist_round,
    get_ranked_queue,
)
router = APIRouter(prefix="/api", tags=["communities"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = defaultdict(set)
        self.main_loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.main_loop = loop

    async def connect(self, websocket: WebSocket, room_id: str):
        if self.main_loop is None:
            try:
                self.main_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        await websocket.accept()
        self.active_connections[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast_room(self, room_id: str, message: dict):
        room_key = str(room_id)
        if room_key not in self.active_connections:
            return
        dead = []
        for ws in list(self.active_connections[room_key]):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room_key)

    def notify_room(self, room_id: str | uuid.UUID, action: str = "update", extra: dict | None = None):
        message = {"type": "room_updated", "room_id": str(room_id), "action": action}
        if extra:
            message.update(extra)

        room_key = str(room_id)
        if room_key not in self.active_connections or not self.active_connections[room_key]:
            return

        if self.main_loop is None:
            try:
                self.main_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

        if self.main_loop and self.main_loop.is_running():
            try:
                current_loop = None
                try:
                    current_loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

                if current_loop is self.main_loop:
                    self.main_loop.create_task(self.broadcast_room(room_key, message))
                else:
                    asyncio.run_coroutine_threadsafe(self.broadcast_room(room_key, message), self.main_loop)
            except Exception:
                pass


manager = ConnectionManager()


@router.websocket("/ws/communities/{room_id}")
async def ws_community(websocket: WebSocket, room_id: uuid.UUID):
    room_str = str(room_id)
    await manager.connect(websocket, room_str)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket, room_str)

MAX_AUDIO_SIZE = 15 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 20 * 60
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
AUDIO_MIME_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "flac": "audio/flac",
}

LIBRARY = [
    {"key": "bustin", "title": "Bustin Loose With Lead", "artist": "Audionautix", "genre": "Рок", "duration_seconds": 128, "color": "#e05638", "file": "bustin_loose.mp3"},
    {"key": "funk90", "title": "90 Seconds Of Funk", "artist": "Audionautix", "genre": "Фанк", "duration_seconds": 91, "color": "#f59e0b", "file": "90_seconds_of_funk.mp3"},
    {"key": "cents5", "title": "5 Cents Back", "artist": "Audionautix", "genre": "Блюз-рок", "duration_seconds": 114, "color": "#3b82f6", "file": "5_cents_back.mp3"},
    {"key": "fallingsky", "title": "Falling Sky", "artist": "Audionautix", "genre": "Хаус", "duration_seconds": 252, "color": "#8b5cf6", "file": "falling_sky.mp3"},
    {"key": "dawn", "title": "Первые лучи", "artist": "Volna Studio", "genre": "Эмбиент", "duration_seconds": 48, "color": "#f4b782"},
    {"key": "city", "title": "После пар", "artist": "Volna Studio", "genre": "Лоу-фай", "duration_seconds": 56, "color": "#b2a1df"},
    {"key": "orbit", "title": "Орбита", "artist": "Volna Studio", "genre": "Электроника", "duration_seconds": 52, "color": "#80cdd3"},
    {"key": "rain", "title": "Тихий двор", "artist": "Volna Studio", "genre": "Инди", "duration_seconds": 44, "color": "#a8c794"},
    {"key": "night", "title": "Ночной маршрут", "artist": "Volna Studio", "genre": "Синтвейв", "duration_seconds": 60, "color": "#f099b2"},
    {"key": "sea", "title": "На одной волне", "artist": "Volna Studio", "genre": "Чилл", "duration_seconds": 50, "color": "#efc970"},
]


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=60)
    avatar_url: str | None = Field(default=None, max_length=500)


class CommunityCreate(BaseModel):
    name: str = Field(min_length=3, max_length=70)
    faculty: str = Field(default="", max_length=90)
    description: str = Field(default="", max_length=260)
    avatar_url: str | None = Field(default=None, max_length=500)
    external_link: str | None = Field(default=None, max_length=500)


class CommunityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=70)
    faculty: str | None = Field(default=None, max_length=90)
    description: str | None = Field(default=None, max_length=260)
    avatar_url: str | None = Field(default=None, max_length=500)
    external_link: str | None = Field(default=None, max_length=500)


class JoinRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class VoteRequest(BaseModel):
    value: int


class FavoriteRequest(BaseModel):
    value: bool


class ModerationRequest(BaseModel):
    status: str | None = None
    action: str | None = None


class RoleRequest(BaseModel):
    role: MemberRole


class CompleteRequest(BaseModel):
    queue_version: int = Field(ge=0)


class PartyStartRequest(BaseModel):
    name: str = Field(default="Вечеринка", max_length=150)


def _clean(value: str, limit: int) -> str:
    return re.sub(r"\s+", " ", value or "").strip()[:limit]


def _uploads_dir() -> Path:
    path = settings.uploads_dir
    return path if path.is_absolute() else BACKEND_DIR / path


def _member(db: Session, room_id: uuid.UUID, user_id: uuid.UUID) -> RoomMember:
    membership = db.get(RoomMember, (room_id, user_id))
    if membership is None:
        room = db.get(Room, room_id)
        if room is not None and room.is_active:
            membership = RoomMember(room_id=room_id, user_id=user_id, role=MemberRole.MEMBER)
            db.add(membership)
            db.commit()
            db.refresh(membership)
            return membership
        raise HTTPException(status_code=403, detail="Нет доступа к сообществу")
    return membership


def _moderator(membership: RoomMember) -> bool:
    return membership.role in (MemberRole.OWNER, MemberRole.MODERATOR)


def _room(db: Session, room_id: uuid.UUID) -> Room:
    room = db.get(Room, room_id)
    if room is None or not room.is_active:
        raise HTTPException(status_code=404, detail="Сообщество не найдено")
    return room


def _active_round(db: Session, room_id: uuid.UUID) -> PlaylistRound:
    playlist_round = db.scalar(
        select(PlaylistRound).where(
            PlaylistRound.room_id == room_id,
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
    )
    if playlist_round is None:
        raise HTTPException(status_code=409, detail="Активная ротация не найдена")
    return playlist_round


def _queue_item(
    db: Session, playlist_round: PlaylistRound, track_id: uuid.UUID
) -> QueueItem | None:
    return db.scalar(
        select(QueueItem).where(
            QueueItem.round_id == playlist_round.id,
            QueueItem.track_id == track_id,
        )
    )


def _add_to_active_queue(
    db: Session, room: Room, track: Track, user_id: uuid.UUID
) -> QueueItem:
    playlist_round = _active_round(db, room.id)
    existing = _queue_item(db, playlist_round, track.id)
    if existing is not None:
        existing.state = QueueItemState.QUEUED
        existing.version += 1
        return existing
    item = QueueItem(
        room_id=room.id,
        round_id=playlist_round.id,
        track_id=track.id,
        added_by_user_id=user_id,
        version=room.queue_version,
    )
    db.add(item)
    return item


def _invite_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))
        if db.scalar(select(Room.id).where(Room.invite_code == code)) is None:
            return code
    raise HTTPException(status_code=503, detail="Не удалось создать код приглашения")


def _domain_error(error: Exception) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, ForbiddenError):
        return HTTPException(status_code=403, detail=str(error))
    return HTTPException(status_code=409, detail=str(error))


@router.get("/bootstrap")
def bootstrap(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    memberships = db.execute(
        select(Room, RoomMember.role)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(RoomMember.user_id == user.id, Room.is_active.is_(True))
        .order_by(RoomMember.joined_at.desc())
    ).all()
    return {
        "user": user,
        "access_token": create_access_token(user.id),
        "communities": [
            {
                "id": room.id,
                "name": room.name,
                "faculty": room.faculty,
                "description": room.description,
                "avatar_url": room.avatar_url,
                "external_link": room.external_link,
                "created_at": room.created_at,
                "role": role.value,
                "member_count": db.scalar(
                    select(func.count()).select_from(RoomMember).where(RoomMember.room_id == room.id)
                ),
            }
            for room, role in memberships
        ],
        "library": LIBRARY,
        "sharing": {
            "base_url": frontend_base_url(),
            "configured": bool(settings.app_base_url.strip()),
            "same_network_required": True,
        },
    }


@router.patch("/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        user.display_name = _clean(payload.display_name, 60)
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url.strip() or None
    db.commit()
    return {"display_name": user.display_name, "avatar_url": user.avatar_url}


@router.post("/communities", status_code=201)
def create_community(
    payload: CommunityCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = Room(
        name=_clean(payload.name, 70),
        faculty=_clean(payload.faculty, 90),
        description=_clean(payload.description, 260),
        avatar_url=payload.avatar_url.strip() if payload.avatar_url else None,
        external_link=payload.external_link.strip() if payload.external_link else None,
        invite_code=_invite_code(db),
        owner_id=user.id,
    )
    db.add(room)
    db.flush()
    db.add(RoomMember(room_id=room.id, user_id=user.id, role=MemberRole.OWNER))
    db.flush()
    create_playlist_round(db, room.id, user.id)
    db.commit()
    return {
        "id": room.id,
        "name": room.name,
        "avatar_url": room.avatar_url,
        "external_link": room.external_link,
        "invite_code": room.invite_code,
        "access_token": create_access_token(user.id),
    }


@router.patch("/communities/{room_id}")
def update_community(
    room_id: uuid.UUID,
    payload: CommunityUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования комнаты")

    if payload.name is not None:
        room.name = _clean(payload.name, 70)
    if payload.faculty is not None:
        room.faculty = _clean(payload.faculty, 90)
    if payload.description is not None:
        room.description = _clean(payload.description, 260)
    if payload.avatar_url is not None:
        room.avatar_url = payload.avatar_url.strip() or None
    if payload.external_link is not None:
        room.external_link = payload.external_link.strip() or None

    db.commit()
    db.refresh(room)
    manager.notify_room(room.id, action="community_updated")
    return {
        "id": room.id,
        "name": room.name,
        "faculty": room.faculty,
        "description": room.description,
        "avatar_url": room.avatar_url,
        "external_link": room.external_link,
    }


@router.delete("/communities/{room_id}", status_code=200)
def delete_community(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.get(Room, room_id)
    if room is None:
        return {"ok": True}

    membership = db.get(RoomMember, (room.id, user.id))
    if membership is not None:
        db.delete(membership)

    if room.owner_id == user.id:
        room.is_active = False

    db.commit()
    manager.notify_room(room_id, action="community_deleted")
    return {"ok": True}


@router.post("/join")
def join_community(
    payload: JoinRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = re.sub(r"[^A-Z0-9]", "", payload.code.upper())
    room = db.scalar(select(Room).where(Room.invite_code == code, Room.is_active.is_(True)))
    if room is None:
        raise HTTPException(status_code=404, detail="Сообщество с таким кодом не найдено")
    if db.get(RoomMember, (room.id, user.id)) is None:
        db.add(RoomMember(room_id=room.id, user_id=user.id))
        db.commit()
        manager.notify_room(room.id, action="member_joined")
    return {
        "id": room.id,
        "name": room.name,
        "access_token": create_access_token(user.id),
    }


def _community_state(db: Session, room: Room, membership: RoomMember, user: User):
    try:
        playlist_round = create_playlist_round(db, room.id, user.id)
        db.commit()
    except (ConflictError, ForbiddenError, NotFoundError) as error:
        db.rollback()
        raise _domain_error(error) from error

    members = db.execute(
        select(User, RoomMember)
        .join(RoomMember, RoomMember.user_id == User.id)
        .where(RoomMember.room_id == room.id)
        .order_by(RoomMember.joined_at)
    ).all()
    queue_items = {
        item.track_id: item
        for item in db.scalars(
            select(QueueItem).where(QueueItem.round_id == playlist_round.id)
        )
    }
    favorites = set(
        db.scalars(select(Favorite.track_id).where(Favorite.user_id == user.id))
    )
    ranked = {item.track.id: item for item in get_ranked_queue(db, room.id, current_user_id=user.id)}
    users = {member_user.id: member_user for member_user, _ in members}
    tracks_payload = []
    for track in db.scalars(
        select(Track).where(Track.room_id == room.id).order_by(Track.created_at, Track.id)
    ):
        item = queue_items.get(track.id)
        vote_score = 0
        my_vote = 0
        if item is not None:
            vote_score = int(
                db.scalar(select(func.coalesce(func.sum(Vote.value), 0)).where(Vote.queue_item_id == item.id))
                or 0
            )
            my_vote = int(
                db.scalar(
                    select(func.coalesce(func.sum(Vote.value), 0)).where(
                        Vote.queue_item_id == item.id, Vote.user_id == user.id
                    )
                )
                or 0
            )
        rank = ranked.get(track.id)
        fair_score = rank.fair_score if rank else float(vote_score)
        tracks_payload.append(
            {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "genre": track.genre,
                "duration_seconds": track.duration_seconds,
                "source_type": track.source_type.value,
                "library_key": track.library_key,
                "status": track.moderation_status.value,
                "created_by": track.created_by_user_id,
                "created_at": track.created_at,
                "contributor": users.get(track.created_by_user_id).display_name if users.get(track.created_by_user_id) else "Удалённый участник",
                "queue_state": item.state.value if item else "removed",
                "queue_version": item.version if item else room.queue_version,
                "vote_score": vote_score,
                "my_vote": my_vote,
                "score": fair_score,
                "penalty": round(vote_score - fair_score, 2),
                "is_favorite": track.id in favorites,
                "license_type": getattr(track, "license_type", "CC / User Upload"),
                "dmca_reports_count": getattr(track, "dmca_reports_count", 0),
            }
        )

    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    activity = []
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).date()
        next_day = day + timedelta(days=1)
        activity.append(
            {
                "date": day.isoformat(),
                "votes": db.scalar(
                    select(func.count()).select_from(VoteEvent).join(QueueItem).where(
                        QueueItem.room_id == room.id,
                        VoteEvent.created_at >= datetime.combine(day, datetime.min.time(), timezone.utc),
                        VoteEvent.created_at < datetime.combine(next_day, datetime.min.time(), timezone.utc),
                    )
                ),
                "plays": db.scalar(
                    select(func.count()).select_from(PlaybackHistory).join(QueueItem).where(
                        QueueItem.room_id == room.id,
                        PlaybackHistory.completed_at >= datetime.combine(day, datetime.min.time(), timezone.utc),
                        PlaybackHistory.completed_at < datetime.combine(next_day, datetime.min.time(), timezone.utc),
                    )
                ),
                "proposals": db.scalar(
                    select(func.count()).select_from(Track).where(
                        Track.room_id == room.id,
                        Track.created_at >= datetime.combine(day, datetime.min.time(), timezone.utc),
                        Track.created_at < datetime.combine(next_day, datetime.min.time(), timezone.utc),
                    )
                ),
            }
        )
    queued_tracks = [track for track in tracks_payload if track["status"] == "approved" and track["queue_state"] == "queued"]
    genres = Counter(track["genre"] or "Другое" for track in queued_tracks)
    contributor_rows = []
    for member_user, _member_row in members:
        contributor_rows.append(
            {
                "id": member_user.id,
                "name": member_user.display_name,
                "tracks": sum(track["created_by"] == member_user.id for track in tracks_payload),
                "plays": db.scalar(
                    select(func.count()).select_from(PlaybackHistory)
                    .join(QueueItem)
                    .join(Track, Track.id == QueueItem.track_id)
                    .where(QueueItem.room_id == room.id, Track.created_by_user_id == member_user.id, PlaybackHistory.completed_at.is_not(None))
                ),
                "votes": db.scalar(
                    select(func.count()).select_from(Vote).join(QueueItem).where(QueueItem.room_id == room.id, Vote.user_id == member_user.id)
                ),
            }
        )
    playing_track = next((t for t in tracks_payload if t["queue_state"] == "playing"), None)
    now_utc = datetime.now(timezone.utc)
    playing_started_at = None
    elapsed_seconds = 0.0
    if playing_track:
        playing_queue_item = db.scalar(
            select(QueueItem).where(
                QueueItem.round_id == playlist_round.id,
                QueueItem.track_id == playing_track["id"],
                QueueItem.state == QueueItemState.PLAYING,
            )
        )
        if playing_queue_item and playing_queue_item.started_at:
            playing_started_at = playing_queue_item.started_at.isoformat()
            elapsed_seconds = max(0.0, (now_utc - playing_queue_item.started_at).total_seconds())

    return {
        "community": {
            "id": room.id,
            "name": room.name,
            "faculty": room.faculty,
            "description": room.description,
            "avatar_url": room.avatar_url,
            "external_link": room.external_link,
            "invite_code": room.invite_code,
            "owner_id": room.owner_id,
            "created_at": room.created_at,
            "role": membership.role.value,
        },
        "party": {
            "is_active": room.party_is_active,
            "name": room.party_name or "Вечеринка",
            "started_at": room.party_started_at.isoformat() if room.party_started_at else None,
            "duration_seconds": int((datetime.now(timezone.utc) - room.party_started_at).total_seconds()) if (room.party_is_active and room.party_started_at) else 0,
        },
        "playback": {
            "current_track_id": playing_track["id"] if playing_track else None,
            "state": "playing" if playing_track else "paused",
            "started_at": playing_started_at,
            "server_time": now_utc.isoformat(),
            "elapsed_seconds": round(elapsed_seconds, 2),
        },
        "week_key": playlist_round.starts_at.date().isoformat(),
        "vote_round": playlist_round.key,
        "tracks": sorted(tracks_payload, key=lambda track: (-float(track["score"]), str(track["created_at"]), str(track["id"]))),
        "members": [
            {"id": member_user.id, "display_name": member_user.display_name, "role": member_row.role.value, "joined_at": member_row.joined_at}
            for member_user, member_row in members
        ],
        "library": LIBRARY,
        "pending_count": sum(track["status"] == "pending" for track in tracks_payload),
        "stats": {
            "votes": db.scalar(select(func.count()).select_from(Vote).join(QueueItem).where(QueueItem.round_id == playlist_round.id)),
            "queued": len(queued_tracks),
            "members": len(members),
            "played_today": db.scalar(select(func.count()).select_from(PlaybackHistory).join(QueueItem).where(QueueItem.room_id == room.id, PlaybackHistory.completed_at >= start_today)),
            "pending": sum(track["status"] == "pending" for track in tracks_payload),
        },
        "dashboard": {
            "activity": activity,
            "genres": [{"name": name, "count": count} for name, count in genres.most_common()],
            "contributors": contributor_rows,
        },
    }


@router.get("/communities/{room_id}")
def community_state(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    return _community_state(db, room, _member(db, room.id, user.id), user)


@router.post("/communities/{room_id}/rotation")
def rotate_playlist(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    try:
        playlist_round = create_playlist_round(db, room_id, user.id, manual=True)
        db.add(ModerationLog(room_id=room_id, actor_user_id=user.id, action="rotation", details="Начата новая ротация"))
        db.commit()
        manager.notify_room(room_id, action="rotation")
        return {"ok": True, "vote_round": playlist_round.key}
    except (ConflictError, ForbiddenError, NotFoundError) as error:
        db.rollback()
        raise _domain_error(error) from error


@router.get("/communities/{room_id}/history")
def history(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _member(db, room_id, user.id)
    votes = db.execute(
        select(VoteEvent, Track, User)
        .join(QueueItem, QueueItem.id == VoteEvent.queue_item_id)
        .join(Track, Track.id == QueueItem.track_id)
        .outerjoin(User, User.id == VoteEvent.user_id)
        .where(QueueItem.room_id == room_id)
        .order_by(VoteEvent.created_at.desc())
        .limit(60)
    ).all()
    plays = db.execute(
        select(PlaybackHistory, Track, User)
        .join(QueueItem, QueueItem.id == PlaybackHistory.queue_item_id)
        .join(Track, Track.id == QueueItem.track_id)
        .outerjoin(User, User.id == PlaybackHistory.played_by_user_id)
        .where(QueueItem.room_id == room_id)
        .order_by(PlaybackHistory.started_at.desc())
        .limit(30)
    ).all()
    return {
        "weeks": [],
        "votes": [
            {"week_key": "", "old_value": event.old_value, "new_value": event.new_value, "created_at": event.created_at, "title": track.title, "artist": track.artist, "display_name": event_user.display_name if event_user else "Удалённый участник"}
            for event, track, event_user in votes
        ],
        "plays": [
            {"played_at": play.started_at, "completed_at": play.completed_at, "queue_version": play.queue_version, "track_id": track.id, "title": track.title, "artist": track.artist, "display_name": play_user.display_name if play_user else "Удалённый участник"}
            for play, track, play_user in plays
        ],
    }


@router.get("/communities/{room_id}/top-history")
def top_history(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """История топов треков по итогам прошедших раундов голосования."""
    _member(db, room_id, user.id)
    snapshots = db.scalars(
        select(RoundTopSnapshot)
        .where(RoundTopSnapshot.room_id == room_id)
        .order_by(RoundTopSnapshot.created_at.desc(), RoundTopSnapshot.rank.asc())
    ).all()

    rounds_map: dict[uuid.UUID, list] = {}
    for s in snapshots:
        rounds_map.setdefault(s.round_id, []).append(s)

    result = []
    for round_id_val, entries in rounds_map.items():
        round_obj = db.get(PlaylistRound, round_id_val)
        result.append({
            "round_id": round_id_val,
            "round_key": round_obj.key if round_obj else "",
            "starts_at": round_obj.starts_at if round_obj else None,
            "ends_at": round_obj.ends_at if round_obj else None,
            "top": [
                {
                    "rank": e.rank,
                    "track_id": e.track_id,
                    "track_title": e.track_title,
                    "track_artist": e.track_artist,
                    "score": e.score,
                    "fair_score": e.fair_score,
                }
                for e in entries
            ],
        })
    return {"history": result}


@router.get("/communities/{room_id}/moderation")
def moderation_history(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    logs = db.execute(
        select(ModerationLog, User)
        .outerjoin(User, User.id == ModerationLog.actor_user_id)
        .where(ModerationLog.room_id == room_id)
        .order_by(ModerationLog.created_at.desc())
        .limit(40)
    ).all()
    return {"logs": [{"action": log.action, "details": log.details, "created_at": log.created_at, "display_name": actor.display_name if actor else "Система"} for log, actor in logs]}


@router.post("/communities/{room_id}/tracks/library", status_code=201)
def add_library_track(
    room_id: uuid.UUID,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    membership = _member(db, room_id, user.id)
    track_key = payload.get("key") or payload.get("library_key")
    item = next((entry for entry in LIBRARY if entry["key"] == track_key), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Трек отсутствует в библиотеке")
    duplicate = db.scalar(select(Track.id).where(Track.room_id == room_id, Track.library_key == item["key"]))
    if duplicate:
        raise HTTPException(status_code=409, detail="Эта композиция уже добавлена")
    status = ModerationStatus.APPROVED if _moderator(membership) else ModerationStatus.PENDING
    track = Track(room_id=room_id, title=item["title"], artist=item["artist"], genre=item["genre"], duration_seconds=item["duration_seconds"], source_type=TrackSource.LIBRARY, library_key=item["key"], moderation_status=status, created_by_user_id=user.id)
    db.add(track)
    db.flush()
    if status == ModerationStatus.APPROVED:
        _add_to_active_queue(db, room, track, user.id)
    db.commit()
    manager.notify_room(room_id, action="track_added", extra={"track_id": str(track.id), "status": status.value})
    return {"id": track.id, "status": status.value}


def _contains_hls_manifest(content: bytes) -> bool:
    return b"#EXTM3U" in content or b"#EXT-X-" in content


def _has_mp3_frame(content: bytes) -> bool:
    """Find a real MPEG audio frame, skipping an optional ID3v2 metadata tag."""

    start = 0
    if content[:3] == b"ID3":
        if len(content) < 10 or any(byte & 0x80 for byte in content[6:10]):
            return False
        tag_size = sum(byte << shift for byte, shift in zip(content[6:10], (21, 14, 7, 0)))
        start = 10 + tag_size + (10 if content[5] & 0x10 else 0)
        if start >= len(content):
            return False

    for index in range(start, len(content) - 3):
        first, second, third = content[index : index + 3]
        if first != 0xFF or second & 0xE0 != 0xE0:
            continue
        version = (second >> 3) & 0x03
        layer = (second >> 1) & 0x03
        bitrate = (third >> 4) & 0x0F
        sample_rate = (third >> 2) & 0x03
        if version != 0x01 and layer != 0 and bitrate not in (0, 0x0F) and sample_rate != 0x03:
            return True
    return False


def _detect_audio_format(content: bytes) -> str | None:
    if _contains_hls_manifest(content):
        return None
    if content[:4] == b"RIFF" and content[8:12] == b"WAVE":
        return "wav"
    if content[:4] == b"OggS":
        return "ogg"
    if content[:4] == b"fLaC":
        return "flac"
    if content[4:8] == b"ftyp":
        return "m4a"
    if len(content) > 2 and content[0] == 0xFF and content[1] & 0xF6 == 0xF0:
        return "aac"
    if _has_mp3_frame(content):
        return "mp3"
    return None


def _audio_duration_seconds(content: bytes) -> int:
    try:
        audio = MutagenFile(BytesIO(content))
        length = float(audio.info.length) if audio is not None and audio.info else 0.0
    except (MutagenError, OSError, ValueError, TypeError, AttributeError):
        length = 0.0
    if not math.isfinite(length) or length <= 0:
        raise HTTPException(
            status_code=400,
            detail="Не удалось определить длительность аудио. Перекодируйте файл в MP3, WAV, OGG, M4A, AAC или FLAC",
        )
    if length > MAX_AUDIO_DURATION_SECONDS:
        raise HTTPException(
            status_code=413,
            detail="Длительность трека не должна превышать 20 минут",
        )
    return max(1, round(length))


async def _read_valid_audio(file: UploadFile) -> tuple[bytes, str, int]:
    content = await file.read(MAX_AUDIO_SIZE + 1)
    if len(content) < 100 or len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Размер файла должен быть от 100 байт до 15 МБ")
    if _contains_hls_manifest(content):
        raise HTTPException(
            status_code=400,
            detail=(
                "Это потоковый HLS-плейлист, а не аудиофайл. "
                "Сохраните или экспортируйте трек как настоящий MP3, M4A, WAV или другой аудиофайл"
            ),
        )
    detected_format = _detect_audio_format(content)
    if detected_format is None:
        raise HTTPException(
            status_code=400,
            detail="Браузер не сможет воспроизвести этот файл: поддерживаются MP3, WAV, OGG, M4A, AAC и FLAC",
        )
    return content, detected_format, _audio_duration_seconds(content)


@router.post("/communities/{room_id}/tracks/upload", status_code=201)
async def upload_track(
    room_id: uuid.UUID,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    artist: str = Form(default=""),
    genre: str = Form(default=""),
    license_type: str = Form(default="CC / User Upload"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    membership = _member(db, room_id, user.id)
    content, detected_format, duration_seconds = await _read_valid_audio(file)
    stem = re.sub(r"[_]+", " ", Path(file.filename or "track").stem)
    parts = re.split(r"\s+[-–—]\s+", stem, maxsplit=1)
    parsed_artist, parsed_title = (parts[0], parts[1]) if len(parts) == 2 else ("Неизвестный артист", stem)
    clean_artist = _clean(artist or parsed_artist, 255)
    clean_title = _clean(title or parsed_title, 255)

    # 1. Exact SHA-256 file hash
    file_hash = hashlib.sha256(content).hexdigest()

    # 2. Normalized signature (artist + title cleaned of special symbols)
    clean_sig = re.sub(r"[^a-zA-Z0-9а-яА-ЯёЁ]", "", f"{clean_artist}{clean_title}".lower())

    # 3. Exact matching against BlacklistedTrack and existing Track
    bl_exact = db.scalar(select(BlacklistedTrack).where(BlacklistedTrack.file_hash == file_hash))
    if bl_exact is not None:
        raise HTTPException(
            status_code=409,
            detail="Этот трек заблокирован правообладателем (DMCA-чёрный список)",
        )

    tr_exact = db.scalar(select(Track).where(Track.file_hash == file_hash))
    if tr_exact is not None:
        raise HTTPException(
            status_code=409,
            detail="Этот трек уже есть на платформе",
        )

    # 4. Fuzzy / audio fingerprint matching: duration diff <= 5.0 seconds
    new_dur = float(duration_seconds)

    # Check candidates in BlacklistedTrack
    bl_candidates = db.scalars(
        select(BlacklistedTrack).where(func.abs(BlacklistedTrack.duration - new_dur) <= 5.0)
    ).all()
    for bl in bl_candidates:
        ratio = (
            difflib.SequenceMatcher(None, clean_sig, bl.normalized_signature).ratio()
            if (clean_sig and bl.normalized_signature)
            else 0.0
        )
        if ratio >= 0.82:
            raise HTTPException(
                status_code=409,
                detail="Трек заблокирован правообладателем (совпадение сигнатуры с чёрным списком)",
            )

    # Check candidates in Track
    tr_candidates = db.scalars(
        select(Track).where(func.abs(Track.duration - new_dur) <= 5.0)
    ).all()
    for tr in tr_candidates:
        ratio = (
            difflib.SequenceMatcher(None, clean_sig, tr.normalized_signature).ratio()
            if (clean_sig and tr.normalized_signature)
            else 0.0
        )
        if ratio >= 0.82:
            raise HTTPException(
                status_code=409,
                detail="Обнаружен дубликат трека (совпадение аудио-отпечатка и метаданных)",
            )

    status = ModerationStatus.APPROVED if _moderator(membership) else ModerationStatus.PENDING
    stored_name = f"{uuid.uuid4().hex}.{detected_format}"
    uploads = _uploads_dir()
    uploads.mkdir(parents=True, exist_ok=True)
    destination = uploads / stored_name
    destination.write_bytes(content)

    track = Track(
        room_id=room_id,
        title=clean_title,
        artist=clean_artist,
        genre=_clean(genre, 100),
        duration_seconds=duration_seconds,
        duration=new_dur,
        source_type=TrackSource.UPLOAD,
        storage_key=stored_name,
        original_filename=file.filename,
        mime_type=AUDIO_MIME_TYPES[detected_format],
        size_bytes=len(content),
        checksum_sha256=file_hash,
        file_hash=file_hash,
        normalized_signature=clean_sig,
        license_type=license_type or "CC / User Upload",
        dmca_reports_count=0,
        moderation_status=status,
        created_by_user_id=user.id,
    )
    try:
        db.add(track)
        db.flush()
        if status == ModerationStatus.APPROVED:
            _add_to_active_queue(db, room, track, user.id)
        db.commit()
        manager.notify_room(
            room_id,
            action="track_uploaded",
            extra={"track_id": str(track.id), "status": status.value},
        )
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    return {
        "id": track.id,
        "status": status.value,
        "format": detected_format,
        "duration_seconds": duration_seconds,
        "license_type": track.license_type,
        "metadata": {"title": track.title, "artist": track.artist},
    }


@router.post("/tracks/{track_id}/report")
def report_track(
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """File a DMCA report against a track."""
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Трек не найден")

    track.dmca_reports_count = (track.dmca_reports_count or 0) + 1
    db.commit()
    db.refresh(track)
    logger.warning(
        "DMCA report filed for track %s by user %s (%s). Current count: %d",
        track_id,
        user.id,
        user.display_name,
        track.dmca_reports_count,
    )
    return {
        "ok": True,
        "reports_count": track.dmca_reports_count,
        "message": "Жалоба принята на рассмотрение администрацией",
    }


@router.get("/communities/{room_id}/tracks/{track_id}/audio")
def track_audio(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    track = db.get(Track, track_id)
    if track is None or track.room_id != room_id or track.source_type != TrackSource.UPLOAD or not track.storage_key:
        raise HTTPException(status_code=404, detail="Аудиофайл не найден")
    path = (_uploads_dir() / track.storage_key).resolve()
    if path.parent != _uploads_dir().resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Аудиофайл не найден")
    return FileResponse(
        path,
        media_type=track.mime_type or "audio/mpeg",
        filename=track.original_filename or path.name,
        content_disposition_type="inline",
    )


@router.post("/communities/{room_id}/tracks/{track_id}/vote")
def vote_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    payload: VoteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _member(db, room_id, user.id)
    item = _queue_item(db, _active_round(db, room_id), track_id)
    if item is None:
        raise HTTPException(status_code=409, detail="Трек отсутствует в активной очереди")
    try:
        if payload.value == 0:
            existing = db.scalar(select(Vote).where(Vote.queue_item_id == item.id, Vote.user_id == user.id))
            result = cast_vote(db, item.id, user.id, existing.value) if existing else 0
        else:
            result = cast_vote(db, item.id, user.id, payload.value)
        db.commit()
        manager.notify_room(room_id, action="vote", extra={"track_id": str(track_id), "value": result})
        return {"value": result}
    except (ConflictError, ForbiddenError, NotFoundError, ValueError) as error:
        db.rollback()
        raise _domain_error(error) from error


@router.post("/communities/{room_id}/tracks/{track_id}/favorite")
def favorite_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    payload: FavoriteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _member(db, room_id, user.id)
    track = db.get(Track, track_id)
    if track is None or track.room_id != room_id:
        raise HTTPException(status_code=404, detail="Трек не найден")
    favorite = db.get(Favorite, (user.id, track_id))
    if payload.value and favorite is None:
        db.add(Favorite(user_id=user.id, track_id=track_id))
    elif not payload.value and favorite is not None:
        db.delete(favorite)
    db.commit()
    return {"is_favorite": payload.value}


@router.post("/communities/{room_id}/tracks/{track_id}/moderate")
def moderate_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    payload: ModerationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    track = db.get(Track, track_id)
    if track is None or track.room_id != room_id:
        raise HTTPException(status_code=404, detail="Трек не найден")
    action = payload.action or {"approved": "approve", "rejected": "reject", "banned": "ban"}.get(payload.status or "")
    if action not in {"approve", "reject", "ban", "remove", "restore"}:
        raise HTTPException(status_code=400, detail="Недопустимое действие")
    item = _queue_item(db, _active_round(db, room_id), track_id)
    if action in {"approve", "restore"}:
        track.moderation_status = ModerationStatus.APPROVED
        _add_to_active_queue(db, room, track, track.created_by_user_id or user.id)
    elif action == "reject":
        track.moderation_status = ModerationStatus.REJECTED
        if item:
            item.state = QueueItemState.REMOVED
    elif action == "ban":
        track.moderation_status = ModerationStatus.BANNED
        if item:
            item.state = QueueItemState.REMOVED
    elif action == "remove" and item:
        item.state = QueueItemState.REMOVED
        item.version += 1
    room.queue_version += 1
    db.add(ModerationLog(room_id=room_id, track_id=track_id, actor_user_id=user.id, action=action, details=track.title))
    db.commit()
    manager.notify_room(room_id, action="moderation", extra={"track_id": str(track_id), "action": action, "status": track.moderation_status.value})
    return {"status": track.moderation_status.value, "queue_state": item.state.value if item else "removed"}


@router.post("/communities/{room_id}/tracks/{track_id}/play")
def play_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Управлять общим воспроизведением может только администратор")
    room = db.scalar(select(Room).where(Room.id == room_id).with_for_update())
    playlist_round = _active_round(db, room_id)
    item = _queue_item(db, playlist_round, track_id)
    if item is None or item.state == QueueItemState.REMOVED:
        raise HTTPException(status_code=404, detail="Трек не найден в очереди")
    current = db.scalar(select(QueueItem).where(QueueItem.round_id == playlist_round.id, QueueItem.state == QueueItemState.PLAYING).with_for_update())
    if current is not None and current.id != item.id:
        current.state = QueueItemState.PLAYED
        current.completed_at = datetime.now(timezone.utc)
        db.flush()
    now_utc = datetime.now(timezone.utc)
    if item.state != QueueItemState.PLAYING:
        item.version += 1
        item.state = QueueItemState.PLAYING
        item.started_at = now_utc
        item.completed_at = None
        db.add(PlaybackHistory(queue_item_id=item.id, played_by_user_id=user.id, queue_version=item.version, started_at=item.started_at))
        room.queue_version += 1
    db.commit()
    started_at_str = item.started_at.isoformat() if item.started_at else now_utc.isoformat()
    elapsed = max(0.0, (now_utc - item.started_at).total_seconds()) if item.started_at else 0.0
    playback_extra = {
        "track_id": str(track_id),
        "state": "playing",
        "started_at": started_at_str,
        "server_time": now_utc.isoformat(),
        "elapsed_seconds": round(elapsed, 2),
    }
    manager.notify_room(room_id, action="playback", extra=playback_extra)
    return {"ok": True, "queue_version": item.version, **playback_extra}


@router.post("/communities/{room_id}/tracks/{track_id}/pause")
def pause_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Управлять общим воспроизведением может только администратор")
    room = db.scalar(select(Room).where(Room.id == room_id).with_for_update())
    playlist_round = _active_round(db, room_id)
    current = db.scalar(select(QueueItem).where(QueueItem.round_id == playlist_round.id, QueueItem.state == QueueItemState.PLAYING).with_for_update())
    if current is not None:
        current.state = QueueItemState.QUEUED
        room.queue_version += 1
    item = _queue_item(db, playlist_round, track_id)
    if item is not None and item.state == QueueItemState.PLAYING:
        item.state = QueueItemState.QUEUED
        room.queue_version += 1
    db.commit()
    manager.notify_room(room_id, action="playback", extra={"track_id": str(track_id), "state": "paused"})
    return {"ok": True, "state": "paused", "track_id": str(track_id)}


@router.post("/communities/{room_id}/tracks/{track_id}/complete")
def complete_track(
    room_id: uuid.UUID,
    track_id: uuid.UUID,
    payload: CompleteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _member(db, room_id, user.id)
    item = _queue_item(db, _active_round(db, room_id), track_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Элемент очереди не найден")
    try:
        previous, next_item = complete_current_and_play_next(db, room_id, user.id, expected_queue_item_id=item.id, expected_version=payload.queue_version)
        db.commit()
        next_track_id = str(next_item.track_id) if next_item else None
        now_utc = datetime.now(timezone.utc)
        started_at_str = next_item.started_at.isoformat() if (next_item and next_item.started_at) else None
        manager.notify_room(
            room_id,
            action="playback",
            extra={
                "track_id": next_track_id,
                "state": "playing" if next_item else "paused",
                "started_at": started_at_str,
                "server_time": now_utc.isoformat(),
                "elapsed_seconds": 0.0,
            },
        )
        return {"completed": previous is not None, "next_track": {"id": next_item.track_id} if next_item else None}
    except (ConflictError, ForbiddenError, NotFoundError) as error:
        db.rollback()
        raise _domain_error(error) from error


@router.post("/communities/{room_id}/members/{member_id}/role")
def update_member_role(
    room_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: RoleRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    actor = _member(db, room_id, user.id)
    if actor.role != MemberRole.OWNER:
        raise HTTPException(status_code=403, detail="Только владелец назначает модераторов")
    target = _member(db, room_id, member_id)
    if target.role == MemberRole.OWNER or payload.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="Роль владельца изменить нельзя")
    target.role = payload.role
    db.commit()
    manager.notify_room(room_id, action="role_updated", extra={"member_id": str(member_id), "role": target.role.value})
    return {"role": target.role.value}


@router.post("/communities/{room_id}/party/start")
def start_party(
    room_id: uuid.UUID,
    payload: PartyStartRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Запустить вечеринку может только администратор")
    room = db.scalar(select(Room).where(Room.id == room_id).with_for_update())
    room.party_is_active = True
    room.party_name = payload.name.strip() or "Вечеринка"
    room.party_started_at = datetime.now(timezone.utc)
    try:
        create_playlist_round(db, room_id, user.id, manual=True)
    except Exception:
        pass
    db.commit()
    started_iso = room.party_started_at.isoformat()
    manager.notify_room(
        room_id,
        action="party_status_changed",
        extra={
            "type": "party_status_changed",
            "is_active": True,
            "name": room.party_name,
            "started_at": started_iso,
        },
    )
    return {
        "ok": True,
        "is_active": True,
        "name": room.party_name,
        "started_at": started_iso,
    }


@router.post("/communities/{room_id}/party/stop")
def stop_party(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _member(db, room_id, user.id)
    if not _moderator(membership):
        raise HTTPException(status_code=403, detail="Остановить вечеринку может только администратор")
    room = db.scalar(select(Room).where(Room.id == room_id).with_for_update())
    room.party_is_active = False
    db.commit()
    manager.notify_room(
        room_id,
        action="party_status_changed",
        extra={
            "type": "party_status_changed",
            "is_active": False,
            "name": room.party_name,
            "started_at": room.party_started_at.isoformat() if room.party_started_at else None,
        },
    )
    return {
        "ok": True,
        "is_active": False,
        "name": room.party_name,
    }


@router.get("/communities/{room_id}/party/status")
def party_status(
    room_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _room(db, room_id)
    membership = _member(db, room_id, user.id)
    state = _community_state(db, room, membership, user)

    tracks = [t for t in state["tracks"] if t["status"] == "approved"]
    banger = tracks[0] if tracks else None

    user_scores: dict[uuid.UUID, dict] = {}
    for m in state["members"]:
        user_scores[m["id"]] = {
            "id": str(m["id"]),
            "name": m["display_name"],
            "display_name": m["display_name"],
            "avatar": (m["display_name"] or "У")[:2].upper(),
            "total_score": 0,
            "tracks_count": 0,
        }
    for t in tracks:
        c_id = t["created_by"]
        if c_id in user_scores:
            user_scores[c_id]["total_score"] += int(t["vote_score"] or 0)
            user_scores[c_id]["tracks_count"] += 1

    sorted_hitmakers = sorted(
        user_scores.values(),
        key=lambda u: (-u["total_score"], -u["tracks_count"], u["name"] or ""),
    )
    hitmaker = sorted_hitmakers[0] if sorted_hitmakers and (sorted_hitmakers[0]["tracks_count"] > 0 or sorted_hitmakers[0]["total_score"] > 0) else (sorted_hitmakers[0] if sorted_hitmakers else None)

    duration = 0
    if room.party_is_active and room.party_started_at:
        duration = int((datetime.now(timezone.utc) - room.party_started_at).total_seconds())

    return {
        "is_active": room.party_is_active,
        "name": room.party_name or "Вечеринка",
        "started_at": room.party_started_at.isoformat() if room.party_started_at else None,
        "duration_seconds": duration,
        "members_count": state["stats"]["members"],
        "banger_track": banger,
        "hitmaker": hitmaker,
        "tracks": tracks,
        "playback": state["playback"],
        "can_moderate": _moderator(membership),
    }
