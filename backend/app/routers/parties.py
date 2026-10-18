"""backend/app/routers/parties.py

Изолированный роутер для режима «Вечеринка» (Party Mode):
- Отдельные сессии тусовок (PartySession) с уникальным invite_code
- Собственная очередь треков (PartyQueueItem), не связанная с общим чартом комьюнити
- Изолированный список участников вечеринки (PartyParticipant)
- Выделенный WebSocket-канал /ws/parties/{party_id}
- Управление воспроизведением и голосованием строго внутри тусовки
"""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    PartyParticipant,
    PartyQueueItem,
    PartySession,
    PartyVote,
    Room,
    User,
)
from app.routers.communities import LIBRARY, INVITE_ALPHABET

router = APIRouter(prefix="/api/parties", tags=["parties"])


# ── ConnectionManager для изолированных сокетов вечеринок ────────────────────
class PartyConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.main_loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self.main_loop = loop

    async def connect(self, websocket: WebSocket, party_id: str):
        await websocket.accept()
        self.active_connections.setdefault(party_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, party_id: str):
        if party_id in self.active_connections:
            if websocket in self.active_connections[party_id]:
                self.active_connections[party_id].remove(websocket)
            if not self.active_connections[party_id]:
                del self.active_connections[party_id]

    async def broadcast_party(self, party_id: str, message: dict):
        party_key = str(party_id)
        if party_key not in self.active_connections:
            return
        dead = []
        for ws in list(self.active_connections[party_key]):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, party_key)

    def notify_party(self, party_id: str | uuid.UUID, action: str = "update", extra: dict | None = None):
        message = {"type": "party_updated", "party_id": str(party_id), "action": action}
        if extra:
            message.update(extra)

        party_key = str(party_id)
        if party_key not in self.active_connections or not self.active_connections[party_key]:
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
                    self.main_loop.create_task(self.broadcast_party(party_key, message))
                else:
                    asyncio.run_coroutine_threadsafe(self.broadcast_party(party_key, message), self.main_loop)
            except Exception:
                pass


party_manager = PartyConnectionManager()


@router.websocket("/ws/{party_id}")
async def ws_party_endpoint(websocket: WebSocket, party_id: uuid.UUID):
    party_str = str(party_id)
    await party_manager.connect(websocket, party_str)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        party_manager.disconnect(websocket, party_str)


# ── Схемы данных ─────────────────────────────────────────────────────────────
class PartyCreateRequest(BaseModel):
    title: str = Field(default="Субботний Движ 🔥", max_length=150)
    community_id: uuid.UUID | None = None


class PartyJoinRequest(BaseModel):
    invite_code: str = Field(..., max_length=20)


class PartyTrackAddRequest(BaseModel):
    key: str | None = None
    title: str | None = None
    artist: str | None = None
    genre: str | None = None
    duration_seconds: int = 45


class PartyUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=150)


def _clean_title(title: str | None) -> str:
    if not title:
        return "Главная вечеринка 🔥"
    stripped = title.strip().replace(" ", "")
    if not stripped or set(stripped) == {"?"}:
        return "Главная вечеринка 🔥"
    return title.strip()


def _gen_party_code(db: Session) -> str:
    for _ in range(30):
        code = "P" + "".join(secrets.choice(INVITE_ALPHABET) for _ in range(5))
        if db.scalar(select(PartySession.id).where(PartySession.invite_code == code)) is None:
            return code
    raise HTTPException(status_code=503, detail="Не удалось сгенерировать код вечеринки")


# ── Эндпоинты API ────────────────────────────────────────────────────────────

@router.post("/create")
def create_party(
    payload: PartyCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Создать отдельную изолированную сессию вечеринки."""
    code = _gen_party_code(db)
    party = PartySession(
        title=payload.title.strip() or "Вечеринка",
        community_id=payload.community_id,
        host_id=user.id,
        invite_code=code,
        is_active=True,
        started_at=datetime.now(timezone.utc),
        playback_state="paused",
    )
    db.add(party)
    db.flush()

    # Создатель автоматически становится хостом тусовки
    participant = PartyParticipant(
        party_id=party.id,
        user_id=user.id,
        role="host",
    )
    db.add(participant)

    # Заполняем стартовую очередь вечеринки базовыми проверенными треками из библиотеки
    initial_keys = ["bustin", "funk90", "cents5", "fallingsky"]
    lib_lookup = {item["key"]: item for item in LIBRARY}
    for k in initial_keys:
        if k in lib_lookup:
            meta = lib_lookup[k]
            db.add(
                PartyQueueItem(
                    party_id=party.id,
                    title=meta["title"],
                    artist=meta["artist"],
                    genre=meta.get("genre", ""),
                    duration_seconds=meta.get("duration_seconds", 45),
                    library_key=k,
                    source_type="library",
                    added_by_user_id=user.id,
                    score=0,
                )
            )

    db.commit()
    db.refresh(party)

    return {
        "ok": True,
        "party_id": str(party.id),
        "title": party.title,
        "invite_code": party.invite_code,
        "is_active": party.is_active,
        "started_at": party.started_at.isoformat(),
    }


@router.post("/join")
def join_party_by_code(
    payload: PartyJoinRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Присоединение к вечеринке по инвайт-коду."""
    clean_code = payload.invite_code.strip().upper()
    party = db.scalar(select(PartySession).where(PartySession.invite_code == clean_code))
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка с таким кодом не найдена или уже завершена")

    participant = db.scalar(
        select(PartyParticipant).where(
            PartyParticipant.party_id == party.id,
            PartyParticipant.user_id == user.id,
        )
    )
    if participant is None:
        participant = PartyParticipant(
            party_id=party.id,
            user_id=user.id,
            role="guest",
        )
        db.add(participant)
        db.commit()

        party_manager.notify_party(
            party.id,
            action="participant_joined",
            extra={
                "user": {
                    "id": str(user.id),
                    "display_name": user.display_name or "Гость",
                }
            },
        )

    return {
        "ok": True,
        "party_id": str(party.id),
        "title": party.title,
        "invite_code": party.invite_code,
        "role": participant.role,
    }


@router.post("/{party_id}/join")
def join_party_by_id(
    party_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Присоединение к вечеринке по прямому party_id."""
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена или завершена")

    participant = db.scalar(
        select(PartyParticipant).where(
            PartyParticipant.party_id == party.id,
            PartyParticipant.user_id == user.id,
        )
    )
    if participant is None:
        participant = PartyParticipant(
            party_id=party.id,
            user_id=user.id,
            role="guest" if user.id != party.host_id else "host",
        )
        db.add(participant)
        db.commit()

        party_manager.notify_party(
            party.id,
            action="participant_joined",
            extra={
                "user": {
                    "id": str(user.id),
                    "display_name": user.display_name or "Гость",
                }
            },
        )

    return {
        "ok": True,
        "party_id": str(party.id),
        "title": party.title,
        "role": participant.role,
    }


@router.get("/active")
def get_user_active_party(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Возвращает последнюю активную вечеринку, в которой участвует пользователь."""
    part = db.scalar(
        select(PartyParticipant)
        .join(PartySession, PartySession.id == PartyParticipant.party_id)
        .where(
            PartyParticipant.user_id == user.id,
            PartySession.is_active.is_(True),
        )
        .order_by(PartySession.started_at.desc())
    )
    if part is not None:
        party = db.get(PartySession, part.party_id)
        if party and party.is_active:
            return {
                "has_active": True,
                "party_id": str(party.id),
                "title": _clean_title(party.title),
                "invite_code": party.invite_code,
                "is_host": party.host_id == user.id,
            }

    # Если пользователь еще никуда не вошел, проверим глобально активную
    recent_active = db.scalar(
        select(PartySession)
        .where(PartySession.is_active.is_(True))
        .order_by(PartySession.started_at.desc())
    )
    if recent_active is not None:
        return {
            "has_active": True,
            "party_id": str(recent_active.id),
            "title": _clean_title(recent_active.title),
            "invite_code": recent_active.invite_code,
            "is_host": recent_active.host_id == user.id,
        }

    return {"has_active": False}


@router.get("/{party_id}/state")
def get_party_state(
    party_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Полное изолированное состояние вечеринки."""
    party = db.get(PartySession, party_id)
    if party is None:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена")

    # Авто-добавление участника при открытии страницы
    participant = db.scalar(
        select(PartyParticipant).where(
            PartyParticipant.party_id == party.id,
            PartyParticipant.user_id == user.id,
        )
    )
    if participant is None:
        participant = PartyParticipant(
            party_id=party.id,
            user_id=user.id,
            role="host" if user.id == party.host_id else "guest",
        )
        db.add(participant)
        db.commit()

    # Участники вечеринки
    parts = db.execute(
        select(PartyParticipant, User)
        .join(User, User.id == PartyParticipant.user_id)
        .where(PartyParticipant.party_id == party.id)
        .order_by(PartyParticipant.joined_at.asc())
    ).all()

    participants_payload = [
        {
            "id": str(p_user.id),
            "display_name": p_user.display_name or "Гость",
            "avatar": (p_user.display_name or "У")[:2].upper(),
            "role": p_part.role,
            "joined_at": p_part.joined_at.isoformat(),
            "is_host": p_user.id == party.host_id,
        }
        for p_part, p_user in parts
    ]

    # Очередь треков тусовки
    items = db.scalars(
        select(PartyQueueItem)
        .where(PartyQueueItem.party_id == party.id)
        .order_by(PartyQueueItem.score.desc(), PartyQueueItem.created_at.asc())
    ).all()

    # Голоса текущего пользователя
    user_votes = dict(
        db.execute(
            select(PartyVote.party_queue_item_id, PartyVote.value).where(
                PartyVote.party_id == party.id,
                PartyVote.user_id == user.id,
            )
        ).all()
    )

    # Список пользователей для contributor
    user_map = {p_user.id: p_user.display_name or "Участник" for _, p_user in parts}

    tracks_payload = []
    for item in items:
        tracks_payload.append(
            {
                "id": str(item.id),
                "title": item.title,
                "artist": item.artist,
                "genre": item.genre,
                "duration_seconds": item.duration_seconds,
                "library_key": item.library_key,
                "source_type": item.source_type,
                "score": item.score,
                "my_vote": user_votes.get(item.id, 0),
                "contributor": user_map.get(item.added_by_user_id, "Гость"),
                "created_by": str(item.added_by_user_id) if item.added_by_user_id else None,
            }
        )

    # Вычисление Бэнгера
    banger = tracks_payload[0] if tracks_payload else None

    # Вычисление Хитмейкера тусовки
    hitmaker_scores: dict[str, dict] = {}
    for p_part, p_user in parts:
        hitmaker_scores[str(p_user.id)] = {
            "id": str(p_user.id),
            "name": p_user.display_name or "Гость",
            "display_name": p_user.display_name or "Гость",
            "avatar": (p_user.display_name or "У")[:2].upper(),
            "total_score": 0,
            "tracks_count": 0,
        }
    for t in tracks_payload:
        c_id = t["created_by"]
        if c_id in hitmaker_scores:
            hitmaker_scores[c_id]["total_score"] += int(t["score"] or 0)
            hitmaker_scores[c_id]["tracks_count"] += 1

    sorted_hitmakers = sorted(
        hitmaker_scores.values(),
        key=lambda h: (-h["total_score"], -h["tracks_count"], h["name"]),
    )
    hitmaker = sorted_hitmakers[0] if sorted_hitmakers else None

    duration = 0
    if party.is_active and party.started_at:
        duration = int((datetime.now(timezone.utc) - party.started_at).total_seconds())

    return {
        "party": {
            "id": str(party.id),
            "title": _clean_title(party.title),
            "invite_code": party.invite_code,
            "is_active": party.is_active,
            "started_at": party.started_at.isoformat() if party.started_at else None,
            "ended_at": party.ended_at.isoformat() if party.ended_at else None,
            "duration_seconds": duration,
            "host_id": str(party.host_id),
        },
        "is_host": party.host_id == user.id,
        "my_role": participant.role,
        "participants": participants_payload,
        "tracks": tracks_payload,
        "banger_track": banger,
        "hitmaker": hitmaker,
        "playback": {
            "current_track_id": str(party.playback_track_id) if party.playback_track_id else None,
            "state": party.playback_state,
        },
    }


@router.patch("/{party_id}")
def update_party(
    party_id: uuid.UUID,
    payload: PartyUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена")
    party.title = payload.title.strip()
    db.commit()
    party_manager.notify_party(party.id, action="party_updated", extra={"title": party.title})
    return {"ok": True, "title": party.title}


@router.post("/{party_id}/tracks")
def add_party_track(
    party_id: uuid.UUID,
    payload: PartyTrackAddRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Добавить трек строго в очередь вечеринки."""
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена или завершена")

    title = payload.title or ""
    artist = payload.artist or ""
    genre = payload.genre or "Вечеринка"
    duration = payload.duration_seconds or 45
    key = payload.key

    if payload.key:
        lib_lookup = {item["key"]: item for item in LIBRARY}
        if payload.key in lib_lookup:
            meta = lib_lookup[payload.key]
            title = meta["title"]
            artist = meta["artist"]
            genre = meta.get("genre", "Библиотека")
            duration = meta.get("duration_seconds", 45)

    if not title:
        raise HTTPException(status_code=400, detail="Название трека обязательно")

    item = PartyQueueItem(
        party_id=party.id,
        title=title.strip(),
        artist=artist.strip(),
        genre=genre.strip(),
        duration_seconds=duration,
        library_key=key,
        source_type="library" if key else "upload",
        added_by_user_id=user.id,
        score=0,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    party_manager.notify_party(
        party.id,
        action="track_added",
        extra={
            "track": {
                "id": str(item.id),
                "title": item.title,
                "artist": item.artist,
                "score": 0,
                "contributor": user.display_name or "Гость",
            }
        },
    )

    return {
        "ok": True,
        "id": str(item.id),
        "title": item.title,
        "artist": item.artist,
        "score": item.score,
    }


@router.post("/{party_id}/tracks/{track_id}/vote")
def vote_party_track(
    party_id: uuid.UUID,
    track_id: uuid.UUID,
    payload: PartyVoteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Голосование за трек внутри тусовки."""
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка завершена")

    item = db.get(PartyQueueItem, track_id)
    if item is None or item.party_id != party.id:
        raise HTTPException(status_code=404, detail="Трек не найден в очереди вечеринки")

    vote = db.scalar(
        select(PartyVote).where(
            PartyVote.party_queue_item_id == item.id,
            PartyVote.user_id == user.id,
        )
    )

    if payload.value == 0:
        if vote is not None:
            db.delete(vote)
    else:
        if vote is None:
            vote = PartyVote(
                party_id=party.id,
                party_queue_item_id=item.id,
                user_id=user.id,
                value=payload.value,
            )
            db.add(vote)
        else:
            vote.value = payload.value

    db.flush()

    # Пересчет суммы очков трека
    total_score = int(
        db.scalar(
            select(func.coalesce(func.sum(PartyVote.value), 0)).where(
                PartyVote.party_queue_item_id == item.id
            )
        )
        or 0
    )
    item.score = total_score
    db.commit()

    party_manager.notify_party(
        party.id,
        action="vote",
        extra={"track_id": str(track_id), "score": total_score},
    )

    return {"ok": True, "track_id": str(track_id), "score": total_score, "my_vote": payload.value}


@router.post("/{party_id}/tracks/{track_id}/play")
def play_party_track(
    party_id: uuid.UUID,
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Хост запускает воспроизведение трека на вечеринке."""
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена или завершена")

    if party.host_id != user.id:
        raise HTTPException(status_code=403, detail="Управлять музыкой на вечеринке может только хост")

    item = db.get(PartyQueueItem, track_id)
    if item is None or item.party_id != party.id:
        raise HTTPException(status_code=404, detail="Трек не найден в очереди вечеринки")

    party.playback_track_id = item.id
    party.playback_state = "playing"
    db.commit()

    party_manager.notify_party(
        party.id,
        action="playback",
        extra={"track_id": str(track_id), "state": "playing"},
    )

    return {"ok": True, "state": "playing", "track_id": str(track_id)}


@router.post("/{party_id}/tracks/{track_id}/pause")
def pause_party_track(
    party_id: uuid.UUID,
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Хост ставит музыку на паузу."""
    party = db.get(PartySession, party_id)
    if party is None or not party.is_active:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена или завершена")

    if party.host_id != user.id:
        raise HTTPException(status_code=403, detail="Управлять музыкой на вечеринке может только хост")

    party.playback_state = "paused"
    db.commit()

    party_manager.notify_party(
        party.id,
        action="playback",
        extra={"track_id": str(track_id), "state": "paused"},
    )

    return {"ok": True, "state": "paused"}


@router.post("/{party_id}/stop")
def stop_party(
    party_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Завершение вечеринки хостом."""
    party = db.get(PartySession, party_id)
    if party is None:
        raise HTTPException(status_code=404, detail="Вечеринка не найдена")

    if party.host_id != user.id:
        raise HTTPException(status_code=403, detail="Завершить тусовку может только хост")

    party.is_active = False
    party.ended_at = datetime.now(timezone.utc)
    party.playback_state = "paused"
    db.commit()

    party_manager.notify_party(
        party.id,
        action="party_stopped",
        extra={"is_active": False},
    )

    return {"ok": True, "is_active": False}
