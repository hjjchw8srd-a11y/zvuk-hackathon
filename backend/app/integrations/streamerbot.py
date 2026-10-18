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
    elif raw_cmd in {"vote", "v", "+", "+1", "голос", "лайк", "up"}:
        command = "vote"
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
    from app.models import PartySession, PartyQueueItem
    from app.routers.parties import party_manager

    # 1. Resolve active PartySession if any
    party = None
    code = (settings.streamerbot_room_code or "").strip().upper()
    if code:
        party = db.scalar(select(PartySession).where(PartySession.invite_code == code, PartySession.is_active.is_(True)))
    if party is None:
        party = db.scalar(select(PartySession).where(PartySession.is_active.is_(True)).order_by(PartySession.started_at.desc()))

    room = _configured_room(db)
    mention = f"@{user_login}" if user_login else "Зритель"
    if room is None and party is None:
        return CommandResult(
            reply=f"{mention}, очередь не настроена: создайте комнату на сайте или укажите код.",
            action="configuration_error",
        )

    target_room_id = party.id if party else (room.id if room else None)

    if command == "help":
        return CommandResult(
            reply=f"{mention}: !sr <трек> — предложить трек, !vote <трек> (или !+ <трек>) — проголосовать, !tracks, !queue, !now.",
            room_id=target_room_id,
            action="help",
        )

    if command == "tracks":
        from app.routers.communities import LIBRARY

        choices = ", ".join(f"{entry['key']} — {entry['title']}" for entry in LIBRARY[:6])
        return CommandResult(
            reply=f"{mention}, медиатека: {choices}", room_id=target_room_id, action="library"
        )

    if command in {"queue", "now"}:
        if party is not None:
            party_items = db.scalars(
                select(PartyQueueItem)
                .where(PartyQueueItem.party_id == party.id)
                .order_by(PartyQueueItem.score.desc(), PartyQueueItem.created_at.asc())
            ).all()
            if command == "now":
                playing_track = None
                if party.playback_track_id:
                    playing_track = next((t for t in party_items if t.id == party.playback_track_id), None)
                if not playing_track and party_items:
                    playing_track = party_items[0]
                reply = (
                    f"{mention}, сейчас играет: {playing_track.title} — {playing_track.artist}"
                    if playing_track
                    else f"{mention}, сейчас ничего не играет."
                )
                return CommandResult(reply=reply, room_id=party.id, action="now")
            else:
                upcoming = [t.title for t in party_items[:4]]
                reply = (
                    f"{mention}, топ очереди тусовки: " + " → ".join(upcoming)
                    if upcoming
                    else f"{mention}, очередь тусовки пока пуста."
                )
                return CommandResult(reply=reply, room_id=party.id, action="queue")

        if room is not None:
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

    if command == "vote":
        if not argument:
            return CommandResult(
                reply=f"{mention}, укажите трек: !vote <название> (или !+ <название>). Например: !vote dawn",
                room_id=target_room_id,
                action="usage",
            )
        matches = _library_matches(argument)
        if not matches:
            return CommandResult(
                reply=f"{mention}, трек «{argument[:50]}» не найден в медиатеке. Напишите !tracks для списка.",
                room_id=target_room_id,
                action="not_found",
            )
        if len(matches) > 1:
            variants = ", ".join(entry["key"] for entry in matches[:5])
            return CommandResult(
                reply=f"{mention}, найдено несколько треков: {variants}. Укажите точный код.",
                room_id=target_room_id,
                action="ambiguous",
            )
        item = matches[0]

        if party is not None:
            from app.models import PartyVote

            fallback_room = room or db.scalar(select(Room).order_by(Room.created_at.desc()).limit(1))
            viewer = _ensure_twitch_viewer(
                db, fallback_room, twitch_user_id, user_login, user_name or user_login
            ) if fallback_room else None

            party_item = db.scalar(
                select(PartyQueueItem).where(
                    PartyQueueItem.party_id == party.id,
                    PartyQueueItem.library_key == item["key"],
                )
            )
            if party_item is None:
                return CommandResult(
                    reply=f"{mention}, трек «{item['title']}» еще не в очереди тусовки. Вы можете предложить его: !sr {item['key']} 🎵",
                    room_id=party.id,
                    action="not_in_queue",
                )

            if viewer:
                already_voted = db.scalar(
                    select(PartyVote).where(
                        PartyVote.party_queue_item_id == party_item.id,
                        PartyVote.user_id == viewer.id,
                    )
                )
                if already_voted is not None:
                    return CommandResult(
                        reply=f"{mention}, вы уже голосовали за «{party_item.title}» (всего баллов: {party_item.score}) 👍",
                        room_id=party.id,
                        track_id=party_item.id,
                        action="already_voted",
                    )
                db.add(
                    PartyVote(
                        party_id=party.id,
                        party_queue_item_id=party_item.id,
                        user_id=viewer.id,
                        value=1,
                    )
                )

            party_item.score += 1
            db.commit()
            party_manager.notify_party(
                party.id,
                action="track_voted",
                extra={
                    "track_id": str(party_item.id),
                    "title": party_item.title,
                    "score": party_item.score,
                    "voted_by": user_login,
                },
            )
            return CommandResult(
                reply=f"{mention}, ваш голос за «{party_item.title}» учтен! Рейтинг трека: {party_item.score} 🔥",
                room_id=party.id,
                track_id=party_item.id,
                action="track_voted",
            )
        else:
            return CommandResult(
                reply=f"{mention}, голосование доступно во время активной вечеринки на сайте.",
                room_id=target_room_id,
                action="party_inactive",
            )

    if not argument:
        return CommandResult(
            reply=f"{mention}, используйте: !sr <название трека>. Команда !tracks покажет варианты, а для загрузки своего MP3 зайдите на сайт.",
            room_id=target_room_id,
            action="usage",
        )

    matches = _library_matches(argument)
    if not matches:
        return CommandResult(
            reply=f"{mention}, трек «{argument[:50]}» не найден в медиатеке. Напишите !tracks или загрузите свой MP3 на сайте.",
            room_id=target_room_id,
            action="not_found",
        )
    if len(matches) > 1:
        variants = ", ".join(entry["key"] for entry in matches[:5])
        return CommandResult(
            reply=f"{mention}, найдено несколько треков: {variants}. Укажите точный код.",
            room_id=target_room_id,
            action="ambiguous",
        )

    item = matches[0]

    # Handle active PartySession
    if party is not None:
        from app.models import PartyVote

        fallback_room = room or db.scalar(select(Room).order_by(Room.created_at.desc()).limit(1))
        viewer = _ensure_twitch_viewer(
            db, fallback_room, twitch_user_id, user_login, user_name or user_login
        ) if fallback_room else None

        party_item = db.scalar(
            select(PartyQueueItem).where(
                PartyQueueItem.party_id == party.id,
                PartyQueueItem.library_key == item["key"],
            )
        )
        if party_item is not None:
            # Check if this user already voted for this track
            already_voted = False
            if viewer:
                already_voted = db.scalar(
                    select(PartyVote).where(
                        PartyVote.party_queue_item_id == party_item.id,
                        PartyVote.user_id == viewer.id,
                    )
                ) is not None

            if already_voted:
                return CommandResult(
                    reply=f"{mention}, трек «{item['title']}» уже в очереди, и вы уже за него голосовали! (баллы: {party_item.score}) 👍",
                    room_id=party.id,
                    track_id=party_item.id,
                    action="duplicate_voted",
                )
            else:
                return CommandResult(
                    reply=f"{mention}, трек «{item['title']}» уже находится в очереди! Напишите !vote {item['key']} (или !+ {item['key']}), чтобы проголосовать за него 🗳️",
                    room_id=party.id,
                    track_id=party_item.id,
                    action="duplicate_suggest_vote",
                )

        new_party_item = PartyQueueItem(
            party_id=party.id,
            title=item["title"],
            artist=item["artist"],
            genre=item.get("genre", "Вечеринка"),
            duration_seconds=item["duration_seconds"],
            source_type="library",
            library_key=item["key"],
            added_by_user_id=viewer.id if viewer else None,
            score=1,
        )
        db.add(new_party_item)
        db.flush()

        if viewer:
            db.add(
                PartyVote(
                    party_id=party.id,
                    party_queue_item_id=new_party_item.id,
                    user_id=viewer.id,
                    value=1,
                )
            )

        db.commit()
        db.refresh(new_party_item)
        party_manager.notify_party(
            party.id,
            action="track_added",
            extra={
                "track_id": str(new_party_item.id),
                "title": new_party_item.title,
                "contributor": viewer.display_name if viewer else user_login,
            },
        )
        return CommandResult(
            reply=f"{mention}, «{new_party_item.title}» добавлен в очередь вечеринки 🎵",
            room_id=party.id,
            track_id=new_party_item.id,
            action="track_added",
        )

    # Fallback to Community Room Mode if no party is active
    duplicate = db.scalar(
        select(Track).where(Track.room_id == room.id, Track.library_key == item["key"])
    )
    if duplicate is not None:
        return CommandResult(
            reply=f"{mention}, трек «{item['title']}» уже находится в очереди! Напишите !vote {item['key']}, чтобы проголосовать за него 🗳️",
            room_id=room.id,
            track_id=duplicate.id,
            action="duplicate_suggest_vote",
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
        moderation_status=ModerationStatus.APPROVED,
        created_by_user_id=viewer.id,
    )
    db.add(track)
    db.flush()

    from app.routers.communities import _add_to_active_queue, manager
    _add_to_active_queue(db, room, track, viewer.id)
    db.commit()
    db.refresh(track)

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
        reply=f"{mention}, «{track.title}» добавлен в очередь воспроизведения 🎵",
        room_id=room.id,
        track_id=track.id,
        action="track_added",
    )


class StreamerBotBridge:
    def __init__(self) -> None:
        self.task: asyncio.Task | None = None
        self.connected = False
        self.authenticated = False
        self.twitch_irc_connected = False
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
            "twitch_irc_connected": self.twitch_irc_connected,
            "twitch_channel": settings.twitch_channel,
            "url": settings.streamerbot_ws_url,
            "room_id": settings.streamerbot_room_id or None,
            "room_code": settings.streamerbot_room_code or None,
            "last_error": self.last_error,
            "last_event_at": self.last_event_at.isoformat() if self.last_event_at else None,
            "commands_processed": self.commands_processed,
            "commands": ["!sr <трек>", "!vote <трек>", "!tracks", "!queue", "!now", "!help"],
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
        self.twitch_irc_connected = False

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

    async def _connect_twitch_irc(self) -> None:
        import random
        import websockets

        channel = (settings.twitch_channel or "scruffy892").strip().lstrip("#").lower()
        if not channel:
            return

        async with websockets.connect(
            "wss://irc-ws.chat.twitch.tv:443", open_timeout=20, ping_interval=30, ping_timeout=30
        ) as ws:
            await ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands")
            await ws.send("PASS SCHMOOPIE")
            await ws.send(f"NICK justinfan{random.randint(10000, 99999)}")
            await ws.send(f"JOIN #{channel}")
            self.twitch_irc_connected = True
            logger.info("Direct Twitch IRC connected and joined #%s", channel)

            try:
                async for raw in ws:
                    for line in raw.split("\r\n"):
                        if not line:
                            continue
                        if line.startswith("PING"):
                            await ws.send("PONG :tmi.twitch.tv")
                            continue
                        if "PRIVMSG" in line:
                            match = re.search(
                                r"display-name=([^;]*).*?user-id=([^;]*).*?:(\w+)!.*?PRIVMSG #\w+ :(.*)$",
                                line,
                            )
                            if match:
                                disp, uid, login, text = match.groups()
                            else:
                                sm = re.search(r":(\w+)!.*?PRIVMSG #\w+ :(.*)$", line)
                                if sm:
                                    login, text = sm.groups()
                                    disp, uid = login, ""
                                else:
                                    continue

                            text = text.strip()
                            if text.startswith(settings.streamerbot_command_prefix or "!"):
                                await self._on_chat_message(
                                    {
                                        "text": text,
                                        "user": {
                                            "id": uid,
                                            "login": login,
                                            "name": disp or login,
                                        },
                                    }
                                )
            finally:
                self.twitch_irc_connected = False

    async def _run(self) -> None:
        await asyncio.gather(
            self._run_streamerbot_loop(),
            self._run_twitch_irc_loop(),
            return_exceptions=True,
        )

    async def _run_streamerbot_loop(self) -> None:
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

    async def _run_twitch_irc_loop(self) -> None:
        delay = 2
        while True:
            try:
                await self._connect_twitch_irc()
                delay = 2
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("Twitch IRC listener: %s", error)
            finally:
                self.twitch_irc_connected = False
            await asyncio.sleep(delay)
            delay = min(delay * 2, 20)

    async def _on_chat_message(self, data: dict) -> None:
        user = data.get("user") or {}
        text = str(data.get("text") or "").strip()
        login = str(user.get("login") or "viewer").lower()

        if not text.startswith(settings.streamerbot_command_prefix or "!"):
            return

        # Deduplicate command within a 3-second window (prevents dual firing from Streamer.bot + Twitch IRC)
        now_bucket = int(datetime.now(timezone.utc).timestamp()) // 3
        norm_key = f"cmd:{login}:{text.casefold()}:{now_bucket}"
        if norm_key in self._recent_id_set:
            return
        if len(self._recent_ids) == self._recent_ids.maxlen:
            self._recent_id_set.discard(self._recent_ids[0])
        self._recent_ids.append(norm_key)
        self._recent_id_set.add(norm_key)

        result = await asyncio.to_thread(
            self._handle_in_database,
            text,
            str(user.get("id") or ""),
            login,
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
        try:
            await self._socket.send(
                json.dumps(
                    {
                        "request": "SendMessage",
                        "id": f"reply-{uuid.uuid4()}",
                        "platform": "Twitch",
                        "bot": False,
                        "internal": False,
                        "message": message[:450],
                    },
                    ensure_ascii=False,
                )
            )
        except Exception as e:
            logger.warning("Streamer.bot send_chat_message failed: %s", e)


streamerbot_bridge = StreamerBotBridge()
