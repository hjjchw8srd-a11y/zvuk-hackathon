"""Bridge between Streamer.bot's local WebSocket server and the playlist.

Streamer.bot owns the Twitch OAuth integration.  This application only talks
to its loopback WebSocket server, so no Twitch client secret or public callback
is required here.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    MemberRole,
    ModerationStatus,
    PlaylistRound,
    QueueItemState,
    Room,
    RoomMember,
    RoundStatus,
    Track,
    TrackSource,
    User,
)
from app.services import create_playlist_round, get_ranked_queue


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CommandResult:
    reply: str | None
    room_id: uuid.UUID | None = None
    track_id: uuid.UUID | None = None
    action: str = "ignored"


def _normal(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _configured_room(db: Session) -> Room | None:
    if settings.streamerbot_room_id.strip():
        try:
            room_id = uuid.UUID(settings.streamerbot_room_id.strip())
            room = db.scalar(select(Room).where(Room.id == room_id, Room.is_active.is_(True)))
            if room is not None:
                return room
        except ValueError:
            pass

    code = settings.streamerbot_room_code.strip().upper()
    if code:
        room = db.scalar(
            select(Room).where(
                Room.invite_code == code,
                Room.is_active.is_(True),
            )
        )
        if room is not None:
            return room

    # Fallback 1: Default community ZVUK26
    default_room = db.scalar(
        select(Room).where(
            Room.invite_code == "ZVUK26",
            Room.is_active.is_(True),
        )
    )
    if default_room is not None:
        return default_room

    # Fallback 2: Most recently created active room
    return db.scalar(select(Room).where(Room.is_active.is_(True)).order_by(Room.created_at.desc()).limit(1))


def _ensure_twitch_viewer(
    db: Session, room: Room, twitch_id: str, login: str, display_name: str
) -> User:
    username = f"twitch_{_normal(login).replace(' ', '_')}"[:60]
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, display_name=display_name or login or "Twitch viewer")
        db.add(user)
        db.flush()
    elif display_name and user.display_name != display_name:
        user.display_name = display_name

    if db.get(RoomMember, (room.id, user.id)) is None:
        db.add(RoomMember(room_id=room.id, user_id=user.id, role=MemberRole.MEMBER))
    return user


def _library_matches(query: str) -> list[dict]:
    # Import lazily to avoid a router/integration import cycle at startup.
    from app.routers.communities import LIBRARY

    needle = _normal(query)
    exact = [entry for entry in LIBRARY if _normal(entry["key"]) == needle]
    if exact:
        return exact
    return [
        entry
        for entry in LIBRARY
        if needle in _normal(entry["title"])
        or needle in _normal(entry["artist"])
        or needle in _normal(entry["key"])
    ]


def handle_chat_command(
    db: Session,
    *,
    text: str,
    twitch_user_id: str,
    user_login: str,
    user_name: str,
) -> CommandResult:
    """Apply one chat command and return the text Streamer.bot should send."""

    prefix = settings.streamerbot_command_prefix or "!"
    message = text.strip()
    if not message.startswith(prefix):
        return CommandResult(reply=None)

    command_line = message[len(prefix):].strip()
    command, _, argument = command_line.partition(" ")
    raw_cmd = command.casefold()
    argument = argument.strip()

    # Normalization of aliases for Twitch & Russian viewers
    if raw_cmd in {"track", "sr", "song", "трек", "песня"}:
        command = "track"
    elif raw_cmd in {"tracks", "треки", "песни", "список"}:
        command = "tracks"
    elif raw_cmd in {"queue", "очередь", "q"}:
        command = "queue"
    elif raw_cmd in {"now", "np", "сейчас"}:
        command = "now"
    elif raw_cmd in {"help", "помощь", "команды", "хэлп"}:
        command = "help"
    else:
        return CommandResult(reply=None)

    room = _configured_room(db)
    mention = f"@{user_login}" if user_login else "Зритель"
    if room is None:
        return CommandResult(
            reply=f"{mention}, очередь не настроена: создайте комнату на сайте или укажите код.",
            action="configuration_error",
        )

    if command == "help":
        return CommandResult(
            reply=f"{mention}: !sr <название трека>, !tracks, !queue, !now. Для загрузки своего MP3 перейдите на сайт.",
            room_id=room.id,
            action="help",
        )

    if command == "tracks":
        from app.routers.communities import LIBRARY

        choices = ", ".join(f"{entry['key']} — {entry['title']}" for entry in LIBRARY[:6])
        return CommandResult(
            reply=f"{mention}, медиатека: {choices}", room_id=room.id, action="library"
        )

    if command in {"queue", "now"}:
        if db.scalar(
            select(func.count()).select_from(PlaylistRound).where(
                PlaylistRound.room_id == room.id,
                PlaylistRound.status == RoundStatus.ACTIVE,
            )
        ) == 0:
            create_playlist_round(db, room.id, room.owner_id)
            db.commit()
        ranked = get_ranked_queue(db, room.id)
        playing = next(
            (item for item in ranked if item.queue_item.state == QueueItemState.PLAYING),
            None,
        )
        if command == "now":
            reply = (
                f"{mention}, сейчас играет: {playing.track.title} — {playing.track.artist}"
                if playing
                else f"{mention}, сейчас ничего не играет."
            )
            return CommandResult(reply=reply, room_id=room.id, action="now")

        upcoming = [
            item.track.title
            for item in ranked
            if item.queue_item.state in {QueueItemState.QUEUED, QueueItemState.PLAYING}
        ][:3]
        reply = (
            f"{mention}, следующие треки: " + " → ".join(upcoming)
            if upcoming
            else f"{mention}, очередь пока пуста."
        )
        return CommandResult(reply=reply, room_id=room.id, action="queue")

    if not argument:
        return CommandResult(
            reply=f"{mention}, используйте: !sr <название трека>. Команда !tracks покажет варианты, а для загрузки своего MP3 зайдите на сайт.",
            room_id=room.id,
            action="usage",
        )

    matches = _library_matches(argument)
    if not matches:
        return CommandResult(
            reply=f"{mention}, трек «{argument[:50]}» не найден в медиатеке. Напишите !tracks или загрузите свой MP3 на сайте.",
            room_id=room.id,
            action="not_found",
        )
    if len(matches) > 1:
        variants = ", ".join(entry["key"] for entry in matches[:5])
        return CommandResult(
            reply=f"{mention}, найдено несколько треков: {variants}. Укажите код.",
            room_id=room.id,
            action="ambiguous",
        )

    item = matches[0]
    duplicate = db.scalar(
        select(Track).where(Track.room_id == room.id, Track.library_key == item["key"])
    )
    if duplicate is not None:
        return CommandResult(
            reply=f"{mention}, «{item['title']}» уже предложен или находится в очереди.",
            room_id=room.id,
            track_id=duplicate.id,
            action="duplicate",
        )

    viewer = _ensure_twitch_viewer(
        db, room, twitch_user_id, user_login, user_name or user_login
    )
    if db.scalar(
        select(func.count()).select_from(PlaylistRound).where(
            PlaylistRound.room_id == room.id,
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
    ) == 0:
        create_playlist_round(db, room.id, room.owner_id)

    track = Track(
        room_id=room.id,
        title=item["title"],
        artist=item["artist"],
        genre=item["genre"],
        duration_seconds=item["duration_seconds"],
        duration=float(item["duration_seconds"]),
        source_type=TrackSource.LIBRARY,
        library_key=item["key"],
        moderation_status=ModerationStatus.PENDING,
        created_by_user_id=viewer.id,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    from app.routers.communities import manager

    manager.notify_room(
        room.id,
        action="track_added_from_twitch",
        extra={
            "track_id": str(track.id),
            "status": track.moderation_status.value,
            "twitch_user": user_login,
        },
    )
    return CommandResult(
        reply=f"{mention}, «{track.title}» отправлен модератору на рассмотрение 🎵",
        room_id=room.id,
        track_id=track.id,
        action="track_proposed",
    )


class StreamerBotBridge:
    def __init__(self) -> None:
        self.task: asyncio.Task | None = None
        self.connected = False
        self.authenticated = False
        self.last_error: str | None = None
        self.last_event_at: datetime | None = None
        self.commands_processed = 0
        self._socket = None
        self._recent_ids: deque[str] = deque(maxlen=500)
        self._recent_id_set: set[str] = set()

    def snapshot(self) -> dict:
        return {
            "enabled": settings.streamerbot_enabled,
            "connected": self.connected,
            "authenticated": self.authenticated,
            "url": settings.streamerbot_ws_url,
            "room_id": settings.streamerbot_room_id or None,
            "room_code": settings.streamerbot_room_code or None,
            "last_error": self.last_error,
            "last_event_at": self.last_event_at.isoformat() if self.last_event_at else None,
            "commands_processed": self.commands_processed,
            "commands": ["!track", "!tracks", "!queue", "!now", "!help"],
        }

    def start(self) -> None:
        if settings.streamerbot_enabled and (self.task is None or self.task.done()):
            self.task = asyncio.create_task(self._run(), name="streamerbot-bridge")

    async def stop(self) -> None:
        if self.task is not None:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        self.task = None
        self.connected = False
        self.authenticated = False

    @staticmethod
    def _authentication(password: str, salt: str, challenge: str) -> str:
        secret = base64.b64encode(
            hashlib.sha256((password + salt).encode("utf-8")).digest()
        ).decode("ascii")
        return base64.b64encode(
            hashlib.sha256((secret + challenge).encode("utf-8")).digest()
        ).decode("ascii")

    async def _connect(self) -> None:
        import websockets

        async with websockets.connect(
            settings.streamerbot_ws_url, open_timeout=30, ping_interval=30, ping_timeout=30
        ) as websocket:
            self._socket = websocket
            hello = json.loads(await asyncio.wait_for(websocket.recv(), timeout=15))
            if hello.get("request") != "Hello":
                raise RuntimeError("Streamer.bot не прислал Hello")
            self.connected = True
            self.last_error = None

            authentication = hello.get("authentication")
            if authentication:
                if not settings.streamerbot_password:
                    raise RuntimeError("Для WebSocket Streamer.bot требуется пароль")
                value = self._authentication(
                    settings.streamerbot_password,
                    authentication["salt"],
                    authentication["challenge"],
                )
                await websocket.send(
                    json.dumps({"request": "Authenticate", "id": "auth", "authentication": value})
                )
                response = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5))
                if response.get("status") != "ok":
                    raise RuntimeError("Streamer.bot отклонил пароль WebSocket")
            self.authenticated = True
            await websocket.send(
                json.dumps(
                    {
                        "request": "Subscribe",
                        "id": "ritm-twitch-chat",
                        "events": {"Twitch": ["ChatMessage"]},
                    }
                )
            )

            async for raw in websocket:
                payload = json.loads(raw)
                event = payload.get("event") or {}
                if event.get("source") == "Twitch" and event.get("type") == "ChatMessage":
                    await self._on_chat_message(payload.get("data") or {})

    async def _run(self) -> None:
        delay = 1
        while True:
            try:
                await self._connect()
                delay = 1
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self.last_error = str(error)
                logger.warning("Streamer.bot bridge: %s", error)
            finally:
                self.connected = False
                self.authenticated = False
                self._socket = None
            await asyncio.sleep(delay)
            delay = min(delay * 2, 15)

    async def _on_chat_message(self, data: dict) -> None:
        message_id = str(data.get("messageId") or "")
        if message_id and message_id in self._recent_id_set:
            return
        if message_id:
            if len(self._recent_ids) == self._recent_ids.maxlen:
                self._recent_id_set.discard(self._recent_ids[0])
            self._recent_ids.append(message_id)
            self._recent_id_set.add(message_id)

        text = str(data.get("text") or "")
        if not text.startswith(settings.streamerbot_command_prefix or "!"):
            return
        user = data.get("user") or {}
        result = await asyncio.to_thread(
            self._handle_in_database,
            text,
            str(user.get("id") or ""),
            str(user.get("login") or "viewer"),
            str(user.get("name") or user.get("login") or "Viewer"),
        )
        self.last_event_at = datetime.now(timezone.utc)
        if result.action != "ignored":
            self.commands_processed += 1
        if result.reply:
            await self.send_chat_message(result.reply)

    @staticmethod
    def _handle_in_database(text: str, user_id: str, login: str, name: str) -> CommandResult:
        with SessionLocal() as db:
            try:
                return handle_chat_command(
                    db,
                    text=text,
                    twitch_user_id=user_id,
                    user_login=login,
                    user_name=name,
                )
            except Exception:
                db.rollback()
                logger.exception("Failed to process Twitch chat command")
                return CommandResult(reply=f"@{login}, не удалось обработать команду. Попробуйте позже.", action="error")

    async def send_chat_message(self, message: str) -> None:
        if self._socket is None:
            return
        await self._socket.send(
            json.dumps(
                {
                    "request": "SendMessage",
                    "id": f"reply-{uuid.uuid4()}",
                    "platform": "twitch",
                    "bot": False,
                    "internal": False,
                    "message": message[:450],
                },
                ensure_ascii=False,
            )
        )


streamerbot_bridge = StreamerBotBridge()
