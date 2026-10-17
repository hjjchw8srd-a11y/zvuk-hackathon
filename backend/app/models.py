"""Database models for the collaborative playlist domain.

The database separates reusable track metadata from a track's appearance in a
particular playlist round. This keeps voting and playback history immutable
when a room starts a new weekly rotation.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def enum_type(enum_class: type[enum.Enum], name: str) -> Enum:
    """Store enums as strings with a database CHECK constraint."""

    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class MemberRole(str, enum.Enum):
    OWNER = "owner"
    MODERATOR = "moderator"
    MEMBER = "member"


class TrackSource(str, enum.Enum):
    LIBRARY = "library"
    UPLOAD = "upload"


class ModerationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    BANNED = "banned"


class RoundStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class QueueItemState(str, enum.Enum):
    QUEUED = "queued"
    PLAYING = "playing"
    PLAYED = "played"
    REMOVED = "removed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    memberships: Mapped[list[RoomMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_users_email", "email", unique=True, postgresql_where=text("email IS NOT NULL")),
    )


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    faculty: Mapped[str] = mapped_column(
        String(150), server_default=text("''"), nullable=False
    )
    description: Mapped[str] = mapped_column(
        Text, server_default=text("''"), nullable=False
    )
    invite_code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        server_default=text("true"), nullable=False
    )
    party_is_active: Mapped[bool] = mapped_column(
        server_default=text("false"), default=False, nullable=False
    )
    party_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    party_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    external_link: Mapped[str | None] = mapped_column(String(500))
    queue_version: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    memberships: Mapped[list[RoomMember]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    tracks: Mapped[list[Track]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )
    rounds: Mapped[list[PlaylistRound]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("queue_version >= 0", name="ck_rooms_queue_version_nonnegative"),
        CheckConstraint(
            "char_length(invite_code) BETWEEN 6 AND 10",
            name="ck_rooms_invite_code_length",
        ),
        Index("ix_rooms_owner_id", "owner_id"),
    )


class RoomMember(Base):
    __tablename__ = "room_members"

    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[MemberRole] = mapped_column(
        enum_type(MemberRole, "member_role"),
        server_default=MemberRole.MEMBER.value,
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    room: Mapped[Room] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")

    __table_args__ = (Index("ix_room_members_user_id", "user_id"),)


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    artist: Mapped[str] = mapped_column(
        String(255), server_default=text("''"), nullable=False
    )
    genre: Mapped[str] = mapped_column(
        String(100), server_default=text("''"), nullable=False
    )
    duration_seconds: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), nullable=False
    )
    source_type: Mapped[TrackSource] = mapped_column(
        enum_type(TrackSource, "track_source"), nullable=False
    )
    library_key: Mapped[str | None] = mapped_column(String(100))
    storage_key: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    moderation_status: Mapped[ModerationStatus] = mapped_column(
        enum_type(ModerationStatus, "moderation_status"),
        server_default=ModerationStatus.PENDING.value,
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    room: Mapped[Room] = relationship(back_populates="tracks")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    queue_items: Mapped[list[QueueItem]] = relationship(
        back_populates="track",
        cascade="all, delete-orphan",
        overlaps="queue_items,round",
    )

    __table_args__ = (
        CheckConstraint("duration_seconds >= 0", name="ck_tracks_duration_nonnegative"),
        CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0", name="ck_tracks_size_nonnegative"
        ),
        CheckConstraint(
            "(source_type = 'library' AND library_key IS NOT NULL) OR "
            "(source_type = 'upload' AND storage_key IS NOT NULL)",
            name="ck_tracks_source_reference",
        ),
        UniqueConstraint("room_id", "library_key", name="uq_tracks_room_library_key"),
        UniqueConstraint("room_id", "id", name="uq_tracks_room_id_id"),
        Index(
            "ix_tracks_room_moderation_created",
            "room_id",
            "moderation_status",
            "created_at",
        ),
        Index("ix_tracks_created_by_user_id", "created_by_user_id"),
    )


class PlaylistRound(Base):
    __tablename__ = "playlist_rounds"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[RoundStatus] = mapped_column(
        enum_type(RoundStatus, "round_status"),
        server_default=RoundStatus.ACTIVE.value,
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    room: Mapped[Room] = relationship(back_populates="rounds")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by_user_id])
    queue_items: Mapped[list[QueueItem]] = relationship(
        back_populates="round",
        cascade="all, delete-orphan",
        overlaps="queue_items,track",
    )

    __table_args__ = (
        UniqueConstraint("room_id", "key", name="uq_playlist_rounds_room_key"),
        UniqueConstraint("room_id", "id", name="uq_playlist_rounds_room_id_id"),
        CheckConstraint(
            "ends_at IS NULL OR ends_at >= starts_at", name="ck_playlist_rounds_dates"
        ),
        Index("ix_playlist_rounds_room_status", "room_id", "status"),
        Index(
            "ux_playlist_rounds_one_active_per_room",
            "room_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
            sqlite_where=text("status = 'active'"),
        ),
    )


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    room_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    round_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False
    )
    track_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False
    )
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    state: Mapped[QueueItemState] = mapped_column(
        enum_type(QueueItemState, "queue_item_state"),
        server_default=QueueItemState.QUEUED.value,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer, server_default=text("0"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    round: Mapped[PlaylistRound] = relationship(
        back_populates="queue_items", overlaps="queue_items,track"
    )
    track: Mapped[Track] = relationship(
        back_populates="queue_items", overlaps="queue_items,round"
    )
    added_by_user: Mapped[User | None] = relationship(foreign_keys=[added_by_user_id])
    votes: Mapped[list[Vote]] = relationship(
        back_populates="queue_item", cascade="all, delete-orphan"
    )
    vote_events: Mapped[list[VoteEvent]] = relationship(
        back_populates="queue_item", cascade="all, delete-orphan"
    )
    playback_history: Mapped[list[PlaybackHistory]] = relationship(
        back_populates="queue_item", cascade="all, delete-orphan"
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["room_id", "round_id"],
            ["playlist_rounds.room_id", "playlist_rounds.id"],
            name="fk_queue_items_round_in_room",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["room_id", "track_id"],
            ["tracks.room_id", "tracks.id"],
            name="fk_queue_items_track_in_room",
            ondelete="CASCADE",
        ),
        UniqueConstraint("round_id", "track_id", name="uq_queue_items_round_track"),
        CheckConstraint("version >= 0", name="ck_queue_items_version_nonnegative"),
        CheckConstraint(
            "completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at",
            name="ck_queue_items_dates",
        ),
        Index("ix_queue_items_round_state_created", "round_id", "state", "created_at"),
        Index("ix_queue_items_track_id", "track_id"),
        Index(
            "ux_queue_items_one_playing_per_round",
            "round_id",
            unique=True,
            postgresql_where=text("state = 'playing'"),
            sqlite_where=text("state = 'playing'"),
        ),
    )


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    queue_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("queue_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    value: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    queue_item: Mapped[QueueItem] = relationship(back_populates="votes")
    user: Mapped[User] = relationship()

    __table_args__ = (
        UniqueConstraint("queue_item_id", "user_id", name="uq_votes_queue_item_user"),
        CheckConstraint("value IN (-1, 1)", name="ck_votes_value"),
        Index("ix_votes_user_id", "user_id"),
    )


class VoteEvent(Base):
    __tablename__ = "vote_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    queue_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("queue_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    old_value: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    new_value: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    queue_item: Mapped[QueueItem] = relationship(back_populates="vote_events")
    user: Mapped[User | None] = relationship()

    __table_args__ = (
        CheckConstraint("old_value IN (-1, 0, 1)", name="ck_vote_events_old_value"),
        CheckConstraint("new_value IN (-1, 0, 1)", name="ck_vote_events_new_value"),
        CheckConstraint("old_value <> new_value", name="ck_vote_events_value_changed"),
        Index("ix_vote_events_queue_created", "queue_item_id", "created_at"),
    )


class PlaybackHistory(Base):
    __tablename__ = "playback_history"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    queue_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("queue_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    played_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    queue_version: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    queue_item: Mapped[QueueItem] = relationship(back_populates="playback_history")
    played_by_user: Mapped[User | None] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "queue_item_id", "queue_version", name="uq_playback_history_item_version"
        ),
        CheckConstraint("queue_version >= 0", name="ck_playback_history_version"),
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= started_at",
            name="ck_playback_history_dates",
        ),
        Index("ix_playback_history_completed_at", "completed_at"),
    )


class ModerationLog(Base):
    __tablename__ = "moderation_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    track_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tracks.id", ondelete="SET NULL")
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[str] = mapped_column(
        Text, server_default=text("''"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    room: Mapped[Room] = relationship()
    track: Mapped[Track | None] = relationship()
    actor: Mapped[User | None] = relationship()

    __table_args__ = (Index("ix_moderation_logs_room_created", "room_id", "created_at"),)


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    track_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship()
    track: Mapped[Track] = relationship()

    __table_args__ = (Index("ix_favorites_track_id", "track_id"),)


class RoundTopSnapshot(Base):
    """Immutable snapshot of the ranked queue created when a round closes."""

    __tablename__ = "round_top_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    round_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("playlist_rounds.id", ondelete="CASCADE"),
        nullable=False,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    track_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tracks.id", ondelete="SET NULL"),
        nullable=True,
    )
    track_title: Mapped[str] = mapped_column(String(255), nullable=False)
    track_artist: Mapped[str] = mapped_column(
        String(255), server_default=text("''"), nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    fair_score: Mapped[float] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    round: Mapped[PlaylistRound] = relationship()
    room: Mapped[Room] = relationship()
    track: Mapped[Track | None] = relationship()

    __table_args__ = (
        Index("ix_round_top_snapshots_round_id", "round_id"),
        Index("ix_round_top_snapshots_room_id", "room_id"),
    )
