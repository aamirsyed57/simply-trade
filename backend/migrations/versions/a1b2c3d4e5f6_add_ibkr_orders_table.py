"""add ibkr_orders table

Revision ID: a1b2c3d4e5f6
Revises: d3fd5db3b8ef
Create Date: 2026-05-07 00:00:00.000000

"""
from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd3fd5db3b8ef'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ibkr_orders',
        sa.Column('ibkr_order_id', sa.BigInteger(), primary_key=True),
        sa.Column('order_ref', sa.String(), nullable=False, server_default=''),
        sa.Column('ticker', sa.String(), nullable=False),
        sa.Column('exchange', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('order_type', sa.String(), nullable=False),
        sa.Column('total_quantity', sa.Numeric(20, 8), nullable=False),
        sa.Column('limit_price', sa.Numeric(20, 8), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('filled', sa.Numeric(20, 8), nullable=False, server_default='0'),
        sa.Column('remaining', sa.Numeric(20, 8), nullable=False, server_default='0'),
        sa.Column('avg_fill_price', sa.Numeric(20, 8), nullable=False, server_default='0'),
        sa.Column('is_platform_order', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('ibkr_orders')
