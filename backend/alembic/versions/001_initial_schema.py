"""Create the collaborative playlist schema.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-10-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum(*values: str, name: str) -> sa.Enum:
    return sa.Enum(
        *values,
        name=name,
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("faculty", sa.String(length=150), server_default="", nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("invite_code", sa.String(length=10), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("queue_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(invite_code) BETWEEN 6 AND 10",
            name="ck_rooms_invite_code_length",
        ),
        sa.CheckConstraint(
            "queue_version >= 0", name="ck_rooms_queue_version_nonnegative"
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invite_code"),
    )
    op.create_index("ix_rooms_owner_id", "rooms", ["owner_id"])

    op.create_table(
        "room_members",
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            _enum("owner", "moderator", "member", name="member_role"),
            server_default="member",
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("room_id", "user_id"),
    )
    op.create_index("ix_room_members_user_id", "room_members", ["user_id"])

    op.create_table(
        "tracks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist", sa.String(length=255), server_default="", nullable=False),
        sa.Column("genre", sa.String(length=100), server_default="", nullable=False),
        sa.Column("duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "source_type",
            _enum("library", "upload", name="track_source"),
            nullable=False,
        ),
        sa.Column("library_key", sa.String(length=100), nullable=True),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "moderation_status",
            _enum("pending", "approved", "rejected", "banned", name="moderation_status"),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "duration_seconds >= 0", name="ck_tracks_duration_nonnegative"
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0", name="ck_tracks_size_nonnegative"
        ),
        sa.CheckConstraint(
            "(source_type = 'library' AND library_key IS NOT NULL) OR "
            "(source_type = 'upload' AND storage_key IS NOT NULL)",
            name="ck_tracks_source_reference",
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "id", name="uq_tracks_room_id_id"),
        sa.UniqueConstraint("room_id", "library_key", name="uq_tracks_room_library_key"),
    )
    op.create_index("ix_tracks_created_by_user_id", "tracks", ["created_by_user_id"])
    op.create_index(
        "ix_tracks_room_moderation_created",
        "tracks",
        ["room_id", "moderation_status", "created_at"],
    )

    op.create_table(
        "playlist_rounds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column(
            "status",
            _enum("active", "closed", name="round_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "starts_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at >= starts_at", name="ck_playlist_rounds_dates"
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "id", name="uq_playlist_rounds_room_id_id"),
        sa.UniqueConstraint("room_id", "key", name="uq_playlist_rounds_room_key"),
    )
    op.create_index(
        "ix_playlist_rounds_room_status", "playlist_rounds", ["room_id", "status"]
    )
    op.create_index(
        "ux_playlist_rounds_one_active_per_room",
        "playlist_rounds",
        ["room_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "queue_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("round_id", sa.Uuid(), nullable=False),
        sa.Column("track_id", sa.Uuid(), nullable=False),
        sa.Column("added_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "state",
            _enum("queued", "playing", "played", "removed", name="queue_item_state"),
            server_default="queued",
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at",
            name="ck_queue_items_dates",
        ),
        sa.CheckConstraint(
            "version >= 0", name="ck_queue_items_version_nonnegative"
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "round_id"],
            ["playlist_rounds.room_id", "playlist_rounds.id"],
            name="fk_queue_items_round_in_room",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["room_id", "track_id"],
            ["tracks.room_id", "tracks.id"],
            name="fk_queue_items_track_in_room",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["added_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("round_id", "track_id", name="uq_queue_items_round_track"),
    )
    op.create_index(
        "ix_queue_items_round_state_created",
        "queue_items",
        ["round_id", "state", "created_at"],
    )
    op.create_index("ix_queue_items_track_id", "queue_items", ["track_id"])
    op.create_index(
        "ux_queue_items_one_playing_per_round",
        "queue_items",
        ["round_id"],
        unique=True,
        postgresql_where=sa.text("state = 'playing'"),
    )

    op.create_table(
        "votes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("queue_item_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("value IN (-1, 1)", name="ck_votes_value"),
        sa.ForeignKeyConstraint(
            ["queue_item_id"], ["queue_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("queue_item_id", "user_id", name="uq_votes_queue_item_user"),
    )
    op.create_index("ix_votes_user_id", "votes", ["user_id"])

    op.create_table(
        "vote_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("queue_item_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("old_value", sa.SmallInteger(), nullable=False),
        sa.Column("new_value", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "new_value IN (-1, 0, 1)", name="ck_vote_events_new_value"
        ),
        sa.CheckConstraint(
            "old_value IN (-1, 0, 1)", name="ck_vote_events_old_value"
        ),
        sa.CheckConstraint(
            "old_value <> new_value", name="ck_vote_events_value_changed"
        ),
        sa.ForeignKeyConstraint(
            ["queue_item_id"], ["queue_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_vote_events_queue_created",
        "vote_events",
        ["queue_item_id", "created_at"],
    )

    op.create_table(
        "playback_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("queue_item_id", sa.Uuid(), nullable=False),
        sa.Column("played_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("queue_version", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "completed_at IS NULL OR completed_at >= started_at",
            name="ck_playback_history_dates",
        ),
        sa.CheckConstraint(
            "queue_version >= 0", name="ck_playback_history_version"
        ),
        sa.ForeignKeyConstraint(
            ["queue_item_id"], ["queue_items.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["played_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "queue_item_id", "queue_version", name="uq_playback_history_item_version"
        ),
    )
    op.create_index(
        "ix_playback_history_completed_at", "playback_history", ["completed_at"]
    )

    op.create_table(
        "moderation_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("track_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("details", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_moderation_logs_room_created",
        "moderation_logs",
        ["room_id", "created_at"],
    )

    op.create_table(
        "favorites",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("track_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "track_id"),
    )
    op.create_index("ix_favorites_track_id", "favorites", ["track_id"])


def downgrade() -> None:
    op.drop_table("favorites")
    op.drop_table("moderation_logs")
    op.drop_table("playback_history")
    op.drop_table("vote_events")
    op.drop_table("votes")
    op.drop_table("queue_items")
    op.drop_table("playlist_rounds")
    op.drop_table("tracks")
    op.drop_table("room_members")
    op.drop_table("rooms")
    op.drop_table("users")
