"""Add user authentication, playlist customization and round top snapshots.

Revision ID: 002_user_auth_and_playlist_features
Revises: 001_initial_schema
Create Date: 2026-10-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "002_auth_and_playlists"
down_revision: str | None = "001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Update users table with auth fields
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.create_index(
        "ix_users_email",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )

    # 2. Update rooms table with playlist customization fields
    op.add_column("rooms", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    op.add_column("rooms", sa.Column("external_link", sa.String(length=500), nullable=True))

    # 3. Create round_top_snapshots table for voting history
    op.create_table(
        "round_top_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("round_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=False),
        sa.Column("track_id", sa.Uuid(), nullable=True),
        sa.Column("track_title", sa.String(length=255), nullable=False),
        sa.Column("track_artist", sa.String(length=255), server_default="", nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("fair_score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["round_id"], ["playlist_rounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_round_top_snapshots_round_id", "round_top_snapshots", ["round_id"]
    )
    op.create_index(
        "ix_round_top_snapshots_room_id", "round_top_snapshots", ["room_id"]
    )


def downgrade() -> None:
    op.drop_table("round_top_snapshots")
    op.drop_column("rooms", "external_link")
    op.drop_column("rooms", "avatar_url")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")
