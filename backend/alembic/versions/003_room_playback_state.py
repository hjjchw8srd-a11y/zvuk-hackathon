"""Add server-authoritative room playback state.

Revision ID: 003_room_playback_state
Revises: 002_auth_and_playlists
"""

from alembic import op
import sqlalchemy as sa


revision = "003_room_playback_state"
down_revision = "002_auth_and_playlists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "room_playback_states",
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("track_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="stopped", nullable=False),
        sa.Column("position_seconds", sa.Float(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('stopped', 'playing', 'paused')", name="ck_room_playback_status"),
        sa.CheckConstraint("position_seconds >= 0", name="ck_room_playback_position_nonnegative"),
        sa.CheckConstraint("revision >= 0", name="ck_room_playback_revision_nonnegative"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("room_id"),
    )


def downgrade() -> None:
    op.drop_table("room_playback_states")
