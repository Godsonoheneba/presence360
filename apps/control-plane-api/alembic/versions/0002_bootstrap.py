"""bootstrap tables

Revision ID: 0002_bootstrap
Revises: 0001_init
Create Date: 2025-01-12 13:15:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_bootstrap"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provisioning_state", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        sa.UniqueConstraint("idempotency_key", name="uq_tenants_idempotency"),
    )
    op.create_table(
        "tenant_db_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("db_host", sa.String(length=255), nullable=False),
        sa.Column("db_port", sa.String(length=16), nullable=False),
        sa.Column("db_name", sa.String(length=128), nullable=False),
        sa.Column("db_user", sa.String(length=128), nullable=False),
        sa.Column("secret_ref", sa.String(length=255), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_tenant_db_tenant"),
    )
    op.create_table(
        "global_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True)),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True)),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True)),
        sa.Column("metadata_json", postgresql.JSONB()),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "support_access_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("support_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("approval_ticket", sa.String(length=128)),
        sa.Column("access_mode", sa.String(length=32), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("support_access_logs")
    op.drop_table("global_audit_logs")
    op.drop_table("tenant_db_connections")
    op.drop_table("tenants")
