from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    MemberRole,
    ModerationStatus,
    PlaybackHistory,
    PlaylistRound,
    QueueItem,
    QueueItemState,
    Room,
    RoomMember,
    Track,
    TrackSource,
    User,
    Vote,
    VoteEvent,
)
from app.services import (
    ForbiddenError,
    cast_vote,
    complete_current_and_play_next,
    create_playlist_round,
    get_ranked_queue,
)


NOW = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)


class PlaylistServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def configure_sqlite(dbapi_connection, _connection_record) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
            dbapi_connection.create_function("char_length", 1, len)

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)

        self.owner = User(display_name="Владелец")
        self.member = User(display_name="Участник")
        self.session.add_all([self.owner, self.member])
        self.session.flush()

        self.room = Room(
            name="Факультетский плейлист",
            invite_code="ABC234",
            owner_id=self.owner.id,
        )
        self.session.add(self.room)
        self.session.flush()
        self.session.add_all(
            [
                RoomMember(
                    room_id=self.room.id,
                    user_id=self.owner.id,
                    role=MemberRole.OWNER,
                ),
                RoomMember(
                    room_id=self.room.id,
                    user_id=self.member.id,
                    role=MemberRole.MEMBER,
                ),
            ]
        )

        self.owner_track_1 = self._track("owner-one", "Первый", self.owner.id)
        self.owner_track_2 = self._track("owner-two", "Второй", self.owner.id)
        self.member_track = self._track("member-one", "Третий", self.member.id)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _track(
        self, library_key: str, title: str, creator_id: uuid.UUID
    ) -> Track:
        track = Track(
            room_id=self.room.id,
            title=title,
            artist="Test Artist",
            source_type=TrackSource.LIBRARY,
            library_key=library_key,
            moderation_status=ModerationStatus.APPROVED,
            created_by_user_id=creator_id,
        )
        self.session.add(track)
        return track

    def _round(self) -> PlaylistRound:
        playlist_round = create_playlist_round(
            self.session,
            self.room.id,
            self.owner.id,
            now=NOW,
        )
        self.session.commit()
        return playlist_round

    def _item_for(self, track: Track) -> QueueItem:
        return self.session.scalar(
            select(QueueItem).where(QueueItem.track_id == track.id)
        )

    def test_weekly_round_is_idempotent_and_materializes_queue(self) -> None:
        first = self._round()
        second = create_playlist_round(
            self.session,
            self.room.id,
            self.owner.id,
            now=NOW + timedelta(hours=2),
        )

        self.assertEqual(first.id, second.id)
        self.assertEqual(
            self.session.scalar(select(func.count()).select_from(PlaylistRound)), 1
        )
        self.assertEqual(
            self.session.scalar(select(func.count()).select_from(QueueItem)), 3
        )

    def test_member_cannot_start_manual_rotation(self) -> None:
        self._round()

        with self.assertRaises(ForbiddenError):
            create_playlist_round(
                self.session,
                self.room.id,
                self.member.id,
                manual=True,
                now=NOW,
            )

    def test_vote_toggle_keeps_current_value_and_full_history(self) -> None:
        self._round()
        item = self._item_for(self.member_track)

        self.assertEqual(cast_vote(self.session, item.id, self.owner.id, 1), 1)
        self.assertEqual(cast_vote(self.session, item.id, self.owner.id, 1), 0)
        self.assertEqual(cast_vote(self.session, item.id, self.owner.id, -1), -1)
        self.session.commit()

        vote = self.session.scalar(select(Vote))
        self.assertIsNotNone(vote)
        self.assertEqual(vote.value, -1)
        self.assertEqual(
            self.session.scalar(select(func.count()).select_from(VoteEvent)), 3
        )

    def test_fairness_penalty_and_atomic_player_transition(self) -> None:
        self._round()
        played_item = self._item_for(self.owner_track_1)
        penalized_item = self._item_for(self.owner_track_2)
        member_item = self._item_for(self.member_track)

        played_item.state = QueueItemState.PLAYED
        played_item.started_at = NOW - timedelta(minutes=4)
        played_item.completed_at = NOW - timedelta(minutes=1)
        self.session.add(
            PlaybackHistory(
                queue_item_id=played_item.id,
                played_by_user_id=self.owner.id,
                queue_version=played_item.version,
                started_at=played_item.started_at,
                completed_at=played_item.completed_at,
            )
        )
        cast_vote(self.session, penalized_item.id, self.member.id, 1)
        self.session.commit()

        ranked = get_ranked_queue(self.session, self.room.id, now=NOW)
        self.assertEqual(ranked[0].queue_item.id, member_item.id)
        self.assertEqual(ranked[0].fair_score, 0)
        self.assertEqual(ranked[1].queue_item.id, penalized_item.id)
        self.assertEqual(ranked[1].fair_score, -1.0)

        previous, current = complete_current_and_play_next(
            self.session, self.room.id, self.owner.id, now=NOW
        )
        self.session.commit()
        self.assertIsNone(previous)
        self.assertEqual(current.id, member_item.id)
        self.assertEqual(current.state, QueueItemState.PLAYING)

        previous, current = complete_current_and_play_next(
            self.session,
            self.room.id,
            self.owner.id,
            expected_queue_item_id=member_item.id,
            expected_version=member_item.version,
            now=NOW + timedelta(minutes=3),
        )
        self.session.commit()
        self.assertEqual(previous.state, QueueItemState.PLAYED)
        self.assertEqual(current.id, penalized_item.id)
        self.assertEqual(current.state, QueueItemState.PLAYING)

    def test_database_rejects_two_playing_items_in_one_round(self) -> None:
        self._round()
        first = self._item_for(self.owner_track_1)
        second = self._item_for(self.member_track)
        first.state = QueueItemState.PLAYING
        second.state = QueueItemState.PLAYING

        with self.assertRaises(IntegrityError):
            self.session.commit()

    def test_database_rejects_track_from_another_room(self) -> None:
        self._round()
        other_room = Room(
            name="Другая комната",
            invite_code="XYZ789",
            owner_id=self.owner.id,
        )
        self.session.add(other_room)
        self.session.flush()
        foreign_track = Track(
            room_id=other_room.id,
            title="Чужой трек",
            artist="Test Artist",
            source_type=TrackSource.LIBRARY,
            library_key="foreign",
            moderation_status=ModerationStatus.APPROVED,
            created_by_user_id=self.owner.id,
        )
        self.session.add(foreign_track)
        self.session.flush()
        active_round = self.session.scalar(select(PlaylistRound))
        self.session.add(
            QueueItem(
                room_id=self.room.id,
                round_id=active_round.id,
                track_id=foreign_track.id,
                added_by_user_id=self.owner.id,
            )
        )

        with self.assertRaises(IntegrityError):
            self.session.commit()


if __name__ == "__main__":
    unittest.main()
