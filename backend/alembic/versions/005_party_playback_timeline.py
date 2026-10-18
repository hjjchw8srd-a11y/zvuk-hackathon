"""Persist the shared party playback timeline.

Revision ID: 005_party_playback_timeline
Revises: 004_admin_track_bans
"""

from alembic import op
import sqlalchemy as sa


revision = "005_party_playback_timeline"
down_revision = "004_admin_track_bans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = {column["name"] for column in sa.inspect(conn).get_columns("party_sessions")}
    if "playback_started_at" not in columns:
        op.add_column(
            "party_sessions",
            sa.Column("playback_started_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "playback_position_seconds" not in columns:
        op.add_column(
            "party_sessions",
            sa.Column(
                "playback_position_seconds",
                sa.Float(),
                server_default=sa.text("0.0"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_column("party_sessions", "playback_position_seconds")
    op.drop_column("party_sessions", "playback_started_at")
