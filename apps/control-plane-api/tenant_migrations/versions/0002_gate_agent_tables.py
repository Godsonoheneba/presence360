"""gate agent tables

Revision ID: 0002_gate_agent_tables
Revises: 0001_init
Create Date: 2025-01-12 17:10:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_gate_agent_tables"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=128)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_table(
        "gate_agent_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_token_hash", sa.String(length=64), nullable=False),
        sa.Column("bootstrap_token_hash", sa.String(length=64)),
        sa.Column("public_key", sa.Text()),
        sa.Column("auth_method", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("last_frame_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["gate_id"], ["gates.id"], name="fk_gate_sessions_gate"),
        sa.UniqueConstraint("session_token_hash", name="uq_gate_sessions_token"),
        sa.UniqueConstraint("bootstrap_token_hash", name="uq_gate_sessions_bootstrap"),
    )
    op.create_index(
        "ix_gate_agent_sessions_session_token_hash",
        "gate_agent_sessions",
        ["session_token_hash"],
    )
    op.create_table(
        "idempotency_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_ref", sa.String(length=64)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="accepted"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),
    )
    op.create_table(
        "recognition_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("frame_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("confidence", sa.Float()),
        sa.Column("rejection_reason", sa.String(length=255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["gate_id"], ["gates.id"], name="fk_recognition_gate"),
        sa.UniqueConstraint("job_id", name="uq_recognition_job_id"),
    )
    op.create_index(
        "ix_recognition_results_frame_id",
        "recognition_results",
        ["frame_id"],
    )
    op.create_table(
        "visit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("frame_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["gate_id"], ["gates.id"], name="fk_visit_events_gate"),
        sa.UniqueConstraint("frame_id", name="uq_visit_events_frame_id"),
    )
    op.create_index(
        "ix_visit_events_gate_captured_at",
        "visit_events",
        ["gate_id", "captured_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_visit_events_gate_captured_at", table_name="visit_events")
    op.drop_table("visit_events")
    op.drop_index("ix_recognition_results_frame_id", table_name="recognition_results")
    op.drop_table("recognition_results")
    op.drop_table("idempotency_keys")
    op.drop_index(
        "ix_gate_agent_sessions_session_token_hash", table_name="gate_agent_sessions"
    )
    op.drop_table("gate_agent_sessions")
    op.drop_table("gates")
