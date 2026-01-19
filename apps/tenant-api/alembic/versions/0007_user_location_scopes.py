"""add user_location_scopes

Revision ID: 0007_user_location_scopes
Revises: 0006_messaging_rules
Create Date: 2025-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_user_location_scopes"
down_revision = "0006_messaging_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_location_scopes",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", sa.String(length=64), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_location_scopes_user"),
        sa.PrimaryKeyConstraint("id", name="pk_user_location_scopes"),
        sa.UniqueConstraint("user_id", "location_id", name="uq_user_location_scope"),
    )


def downgrade() -> None:
    op.drop_table("user_location_scopes")
