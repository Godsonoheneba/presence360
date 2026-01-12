"""messaging and rules

Revision ID: 0006_messaging_rules
Revises: 0005_face_profiles
Create Date: 2025-01-15 09:30:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_messaging_rules"
down_revision = "0005_face_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("phone_enc", sa.Text()))
    op.add_column("people", sa.Column("phone_hash", sa.String(length=64)))
    op.create_index("ix_people_phone_hash", "people", ["phone_hash"])

    op.create_table(
        "message_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("variables_json", postgresql.JSONB()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "message_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True)),
        sa.Column("template_id", postgresql.UUID(as_uuid=True)),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("to_phone_enc", sa.Text()),
        sa.Column("to_phone_hash", sa.String(length=64)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("provider_message_id", sa.Text()),
        sa.Column("cost_cents", sa.Integer()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.Text()),
        sa.Column("provider_response_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], name="fk_message_logs_person"),
        sa.ForeignKeyConstraint(
            ["template_id"], ["message_templates.id"], name="fk_message_logs_template"
        ),
    )
    op.create_index(
        "ix_message_logs_status_sent_at",
        "message_logs",
        ["status", "sent_at"],
    )
    op.create_index(
        "ix_message_logs_person_sent_at",
        "message_logs",
        ["person_id", "sent_at"],
    )

    op.create_table(
        "rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("rule_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("config_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
    )
    op.create_table(
        "rule_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("stats_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["rule_id"], ["rules.id"], name="fk_rule_runs_rule"),
    )
    op.create_index(
        "ix_rule_runs_rule_run_at",
        "rule_runs",
        ["rule_id", "run_at"],
    )
    op.create_table(
        "follow_up_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True)),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], name="fk_follow_up_tasks_person"),
        sa.ForeignKeyConstraint(["rule_id"], ["rules.id"], name="fk_follow_up_tasks_rule"),
        sa.ForeignKeyConstraint(
            ["assigned_to_user_id"],
            ["users.id"],
            name="fk_follow_up_tasks_user",
        ),
    )
    op.create_index(
        "ix_follow_up_tasks_status_due_at",
        "follow_up_tasks",
        ["status", "due_at"],
    )
    op.create_index(
        "ix_follow_up_tasks_person_status",
        "follow_up_tasks",
        ["person_id", "status"],
    )
    op.create_table(
        "follow_up_outcomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("outcome_type", sa.String(length=64), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("recorded_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["task_id"], ["follow_up_tasks.id"], name="fk_follow_up_outcomes_task"
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], name="fk_follow_up_outcomes_user"
        ),
    )


def downgrade() -> None:
    op.drop_table("follow_up_outcomes")
    op.drop_index("ix_follow_up_tasks_person_status", table_name="follow_up_tasks")
    op.drop_index("ix_follow_up_tasks_status_due_at", table_name="follow_up_tasks")
    op.drop_table("follow_up_tasks")
    op.drop_index("ix_rule_runs_rule_run_at", table_name="rule_runs")
    op.drop_table("rule_runs")
    op.drop_table("rules")
    op.drop_index("ix_message_logs_person_sent_at", table_name="message_logs")
    op.drop_index("ix_message_logs_status_sent_at", table_name="message_logs")
    op.drop_table("message_logs")
    op.drop_table("message_templates")
    op.drop_index("ix_people_phone_hash", table_name="people")
    op.drop_column("people", "phone_hash")
    op.drop_column("people", "phone_enc")
