"""add_party_tables_and_columns

Revision ID: 798ed0d23787
Revises: 003_room_playback_state
Create Date: 2026-10-17 13:52:26.881991

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '798ed0d23787'
down_revision: Union[str, Sequence[str], None] = '003_room_playback_state'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [c["name"] for c in inspector.get_columns("rooms")]
    
    if "party_is_active" not in existing_columns:
        op.add_column('rooms', sa.Column('party_is_active', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    if "party_name" not in existing_columns:
        op.add_column('rooms', sa.Column('party_name', sa.String(length=150), nullable=True))
    if "party_started_at" not in existing_columns:
        op.add_column('rooms', sa.Column('party_started_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('rooms', 'party_started_at')
    op.drop_column('rooms', 'party_name')
    op.drop_column('rooms', 'party_is_active')
