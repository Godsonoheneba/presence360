"""face profiles and config

Revision ID: 0005_face_profiles
Revises: 0004_gate_agent_updates
Create Date: 2025-01-13 10:15:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_face_profiles"
down_revision = "0004_gate_agent_updates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_config",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "people",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("consent_status", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "consent_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], name="fk_consent_events_person"),
    )
    op.create_table(
        "face_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("rekognition_face_id", sa.Text(), nullable=False),
        sa.Column("collection_ref", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("consent_event_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], name="fk_face_profiles_person"),
        sa.ForeignKeyConstraint(
            ["consent_event_id"], ["consent_events.id"], name="fk_face_profiles_consent"
        ),
    )
    op.create_index(
        "uq_face_profiles_provider_face",
        "face_profiles",
        ["provider", "rekognition_face_id"],
        unique=True,
    )
    op.create_index(
        "uq_face_profiles_person_provider_active",
        "face_profiles",
        ["person_id", "provider"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_index("uq_face_profiles_person_provider_active", table_name="face_profiles")
    op.drop_index("uq_face_profiles_provider_face", table_name="face_profiles")
    op.drop_table("face_profiles")
    op.drop_table("consent_events")
    op.drop_table("people")
    op.drop_table("tenant_config")
