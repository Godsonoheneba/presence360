"""gate agent updates

Revision ID: 0004_gate_agent_updates
Revises: 0003_gate_agent_tables
Create Date: 2025-01-13 09:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_gate_agent_updates"
down_revision = "0003_gate_agent_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("recognition_results")
    op.create_table(
        "recognition_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("frame_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True)),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("best_confidence", sa.Numeric()),
        sa.Column("best_face_id", sa.Text()),
        sa.Column("person_id", postgresql.UUID(as_uuid=True)),
        sa.Column("decision", sa.Text(), nullable=False, server_default="unknown"),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("provider_response_code", sa.Text()),
        sa.Column("metadata_json", postgresql.JSONB()),
        sa.ForeignKeyConstraint(["gate_id"], ["gates.id"], name="fk_recognition_gate"),
        sa.UniqueConstraint("frame_id", name="uq_recognition_frame_id"),
    )

    op.drop_constraint("uq_idempotency_scope_key", "idempotency_keys", type_="unique")
    op.create_unique_constraint("uq_idempotency_key", "idempotency_keys", ["key"])

    op.create_index(
        "ix_gate_agent_sessions_gate_status",
        "gate_agent_sessions",
        ["gate_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_gate_agent_sessions_gate_status", table_name="gate_agent_sessions")
    op.drop_constraint("uq_idempotency_key", "idempotency_keys", type_="unique")
    op.create_unique_constraint(
        "uq_idempotency_scope_key", "idempotency_keys", ["scope", "key"]
    )

    op.drop_table("recognition_results")
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
