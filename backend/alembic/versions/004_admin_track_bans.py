"""Add durable platform-level track bans.

Revision ID: 004_admin_track_bans
Revises: 031f899f7aca
"""

from alembic import op
import sqlalchemy as sa


revision = "004_admin_track_bans"
down_revision = "031f899f7aca"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = {column["name"] for column in sa.inspect(conn).get_columns("tracks")}
    if "is_admin_banned" not in columns:
        op.add_column(
            "tracks",
            sa.Column(
                "is_admin_banned",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )
    if "admin_banned_by_user_id" not in columns:
        op.add_column("tracks", sa.Column("admin_banned_by_user_id", sa.Uuid(), nullable=True))
        if conn.dialect.name == "postgresql":
            try:
                op.create_foreign_key(
                    "fk_tracks_admin_banned_by_user_id_users",
                    "tracks",
                    "users",
                    ["admin_banned_by_user_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
            except Exception:
                pass
    if "admin_banned_at" not in columns:
        op.add_column("tracks", sa.Column("admin_banned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.drop_constraint("fk_tracks_admin_banned_by_user_id_users", "tracks", type_="foreignkey")
    op.drop_column("tracks", "admin_banned_at")
    op.drop_column("tracks", "admin_banned_by_user_id")
    op.drop_column("tracks", "is_admin_banned")
