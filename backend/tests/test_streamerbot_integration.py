from __future__ import annotations

import unittest

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.integrations.streamerbot import handle_chat_command
from app.models import MemberRole, ModerationStatus, Room, RoomMember, Track, User


class StreamerBotCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )

        @event.listens_for(self.engine, "connect")
        def configure_sqlite(dbapi_connection, _connection_record) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
            dbapi_connection.create_function("char_length", 1, len)

        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, expire_on_commit=False)
        owner = User(username="owner", display_name="Streamer")
        self.db.add(owner)
        self.db.flush()
        self.room = Room(name="Stream", invite_code="TW1234", owner_id=owner.id)
        self.db.add(self.room)
        self.db.flush()
        self.db.add(
            RoomMember(room_id=self.room.id, user_id=owner.id, role=MemberRole.OWNER)
        )
        self.db.commit()

        self.old_room_id = settings.streamerbot_room_id
        self.old_room_code = settings.streamerbot_room_code
        settings.streamerbot_room_id = str(self.room.id)
        settings.streamerbot_room_code = ""

    def tearDown(self) -> None:
        settings.streamerbot_room_id = self.old_room_id
        settings.streamerbot_room_code = self.old_room_code
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def command(self, text: str):
        return handle_chat_command(
            self.db,
            text=text,
            twitch_user_id="42",
            user_login="viewer42",
            user_name="Viewer 42",
        )

    def test_track_command_creates_pending_proposal_and_viewer(self) -> None:
        result = self.command("!track dawn")

        self.assertEqual(result.action, "track_added")
        track = self.db.get(Track, result.track_id)
        self.assertEqual(track.library_key, "dawn")
        self.assertEqual(track.moderation_status, ModerationStatus.APPROVED)
        viewer = self.db.scalar(select(User).where(User.username == "twitch_viewer42"))
        self.assertIsNotNone(viewer)
        self.assertIsNotNone(self.db.get(RoomMember, (self.room.id, viewer.id)))

    def test_duplicate_command_does_not_create_second_track(self) -> None:
        self.command("!track dawn")
        duplicate = self.command("!track dawn")

        self.assertEqual(duplicate.action, "duplicate_suggest_vote")
        self.assertEqual(
            self.db.scalar(select(func.count()).select_from(Track)),
            1,
        )

    def test_non_command_is_ignored(self) -> None:
        result = self.command("обычное сообщение")
        self.assertEqual(result.action, "ignored")
        self.assertIsNone(result.reply)


if __name__ == "__main__":
    unittest.main()
