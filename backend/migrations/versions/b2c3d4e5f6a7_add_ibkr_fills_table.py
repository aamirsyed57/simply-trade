"""add ibkr_fills table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-07 00:00:01.000000

"""
from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ibkr_fills',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('ibkr_exec_id', sa.String(64), unique=True, nullable=False),
        sa.Column('ibkr_order_id', sa.BigInteger(), nullable=True),
        sa.Column('order_ref', sa.String(), nullable=False, server_default=''),
        sa.Column('ticker', sa.String(), nullable=False, server_default=''),
        sa.Column('exchange', sa.String(), nullable=False, server_default=''),
        sa.Column('action', sa.String(), nullable=False, server_default=''),
        sa.Column('qty', sa.Numeric(20, 8), nullable=False),
        sa.Column('price', sa.Numeric(20, 8), nullable=False),
        sa.Column('commission', sa.Numeric(20, 8), nullable=False, server_default='0'),
        sa.Column('is_platform_order', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('execution_mode', sa.String(20), nullable=False, server_default=''),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_ibkr_fills_ibkr_order_id', 'ibkr_fills', ['ibkr_order_id'])
    op.create_index('ix_ibkr_fills_timestamp', 'ibkr_fills', ['timestamp'])


def downgrade() -> None:
    op.drop_table('ibkr_fills')
