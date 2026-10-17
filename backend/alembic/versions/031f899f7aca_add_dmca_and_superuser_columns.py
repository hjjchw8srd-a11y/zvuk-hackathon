"""add_dmca_and_superuser_columns

Revision ID: 031f899f7aca
Revises: 798ed0d23787
Create Date: 2026-10-17 22:20:31.698359

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '031f899f7aca'
down_revision: Union[str, Sequence[str], None] = '798ed0d23787'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'blacklisted_tracks' not in existing_tables:
        op.create_table(
            'blacklisted_tracks',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('file_hash', sa.String(length=64), nullable=False),
            sa.Column('normalized_signature', sa.String(length=255), nullable=False),
            sa.Column('duration', sa.Float(), nullable=False),
            sa.Column('reason', sa.String(length=255), server_default=sa.text("'DMCA violation'"), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_blacklisted_tracks_file_hash'), 'blacklisted_tracks', ['file_hash'], unique=False)
        op.create_index(op.f('ix_blacklisted_tracks_normalized_signature'), 'blacklisted_tracks', ['normalized_signature'], unique=False)

    track_cols = [c['name'] for c in inspector.get_columns('tracks')]
    if 'duration' not in track_cols:
        op.add_column('tracks', sa.Column('duration', sa.Float(), server_default=sa.text('0.0'), nullable=False))
    if 'file_hash' not in track_cols:
        op.add_column('tracks', sa.Column('file_hash', sa.String(length=64), nullable=True))
        op.create_index(op.f('ix_tracks_file_hash'), 'tracks', ['file_hash'], unique=False)
    if 'normalized_signature' not in track_cols:
        op.add_column('tracks', sa.Column('normalized_signature', sa.String(length=255), nullable=True))
        op.create_index(op.f('ix_tracks_normalized_signature'), 'tracks', ['normalized_signature'], unique=False)
    if 'license_type' not in track_cols:
        op.add_column('tracks', sa.Column('license_type', sa.String(length=100), server_default=sa.text("'CC / User Upload'"), nullable=False))
    if 'dmca_reports_count' not in track_cols:
        op.add_column('tracks', sa.Column('dmca_reports_count', sa.Integer(), server_default=sa.text('0'), nullable=False))

    user_cols = [c['name'] for c in inspector.get_columns('users')]
    if 'username' not in user_cols:
        op.add_column('users', sa.Column('username', sa.String(length=60), nullable=True))
        op.create_index('ix_users_username', 'users', ['username'], unique=True, postgresql_where=sa.text('username IS NOT NULL'))
    if 'is_superuser' not in user_cols:
        op.add_column('users', sa.Column('is_superuser', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'is_superuser')
    op.drop_index('ix_users_username', table_name='users', postgresql_where=sa.text('username IS NOT NULL'))
    op.drop_column('users', 'username')
    op.drop_index(op.f('ix_tracks_normalized_signature'), table_name='tracks')
    op.drop_index(op.f('ix_tracks_file_hash'), table_name='tracks')
    op.drop_column('tracks', 'dmca_reports_count')
    op.drop_column('tracks', 'license_type')
    op.drop_column('tracks', 'normalized_signature')
    op.drop_column('tracks', 'file_hash')
    op.drop_column('tracks', 'duration')
    op.drop_index(op.f('ix_blacklisted_tracks_normalized_signature'), table_name='blacklisted_tracks')
    op.drop_index(op.f('ix_blacklisted_tracks_file_hash'), table_name='blacklisted_tracks')
    op.drop_table('blacklisted_tracks')
