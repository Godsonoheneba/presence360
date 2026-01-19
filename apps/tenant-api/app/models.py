import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from .db import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(64), unique=True, nullable=False)
    description = Column(String(255))
    is_system = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), unique=True, nullable=False)
    description = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), primary_key=True)
    permission_id = Column(UUID(as_uuid=True), ForeignKey("permissions.id"), primary_key=True)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    status = Column(String(32), nullable=False, default="invited")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserRole(Base):
    __tablename__ = "user_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)


class UserLocationScope(Base):
    __tablename__ = "user_location_scopes"
    __table_args__ = (
        Index("uq_user_location_scope", "user_id", "location_id", unique=True),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    location_id = Column(String(64), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TenantConfig(Base):
    __tablename__ = "tenant_config"

    key = Column(String(128), primary_key=True)
    value_json = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Person(Base):
    __tablename__ = "people"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(255), nullable=False)
    consent_status = Column(String(32), nullable=False, default="unknown")
    phone_enc = Column(Text)
    phone_hash = Column(String(64), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ConsentEvent(Base):
    __tablename__ = "consent_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    status = Column(String(32), nullable=False)
    source = Column(String(64), nullable=False, default="manual")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FaceProfile(Base):
    __tablename__ = "face_profiles"
    __table_args__ = (
        Index(
            "uq_face_profiles_provider_face",
            "provider",
            "rekognition_face_id",
            unique=True,
        ),
        Index(
            "uq_face_profiles_person_provider_active",
            "person_id",
            "provider",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    provider = Column(String(64), nullable=False)
    rekognition_face_id = Column(Text, nullable=False)
    collection_ref = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    consent_event_id = Column(UUID(as_uuid=True), ForeignKey("consent_events.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deleted_at = Column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_type = Column(String(32), nullable=False)
    action = Column(String(128), nullable=False)
    target_type = Column(String(64), nullable=False)
    target_id = Column(UUID(as_uuid=True), nullable=False)
    metadata_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    channel = Column(String(32), nullable=False)
    body = Column(Text, nullable=False)
    variables_json = Column(JSONB)
    active = Column(Boolean, nullable=False, default=True)
    created_by_user_id = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class MessageLog(Base):
    __tablename__ = "message_logs"
    __table_args__ = (
        Index("ix_message_logs_status_sent_at", "status", "sent_at"),
        Index("ix_message_logs_person_sent_at", "person_id", "sent_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"))
    template_id = Column(UUID(as_uuid=True), ForeignKey("message_templates.id"))
    channel = Column(String(32), nullable=False)
    to_phone_enc = Column(Text)
    to_phone_hash = Column(String(64))
    status = Column(String(32), nullable=False, default="queued")
    provider_message_id = Column(Text)
    cost_cents = Column(Integer)
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    error_code = Column(Text)
    provider_response_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Rule(Base):
    __tablename__ = "rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    rule_type = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    config_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RuleRun(Base):
    __tablename__ = "rule_runs"
    __table_args__ = (Index("ix_rule_runs_rule_run_at", "rule_id", "run_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("rules.id"), nullable=False)
    run_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    stats_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FollowUpTask(Base):
    __tablename__ = "follow_up_tasks"
    __table_args__ = (
        Index("ix_follow_up_tasks_status_due_at", "status", "due_at"),
        Index("ix_follow_up_tasks_person_status", "person_id", "status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("rules.id"))
    assigned_to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String(32), nullable=False, default="open")
    priority = Column(Integer, nullable=False, default=0)
    due_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True))
    notes = Column(Text)


class FollowUpOutcome(Base):
    __tablename__ = "follow_up_outcomes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("follow_up_tasks.id"), nullable=False)
    outcome_type = Column(String(64), nullable=False)
    notes = Column(Text)
    recorded_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Gate(Base):
    __tablename__ = "gates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128))
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GateAgentSession(Base):
    __tablename__ = "gate_agent_sessions"
    __table_args__ = (Index("ix_gate_agent_sessions_gate_status", "gate_id", "status"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gate_id = Column(UUID(as_uuid=True), ForeignKey("gates.id"), nullable=False)
    session_token_hash = Column(String(64), nullable=False, unique=True, index=True)
    bootstrap_token_hash = Column(String(64), unique=True)
    public_key = Column(Text)
    auth_method = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    issued_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_seen_at = Column(DateTime(timezone=True))
    last_frame_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope = Column(String(64), nullable=False)
    key = Column(String(128), nullable=False, unique=True)
    request_hash = Column(String(64), nullable=False)
    response_ref = Column(String(64))
    status = Column(String(32), nullable=False, default="accepted")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RecognitionResult(Base):
    __tablename__ = "recognition_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    frame_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    gate_id = Column(UUID(as_uuid=True), ForeignKey("gates.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True))
    processed_at = Column(DateTime(timezone=True))
    latency_ms = Column(Integer)
    best_confidence = Column(Numeric)
    best_face_id = Column(Text)
    person_id = Column(UUID(as_uuid=True))
    decision = Column(Text, nullable=False, default="unknown")
    rejection_reason = Column(Text)
    provider_response_code = Column(Text)
    metadata_json = Column(JSONB)


class VisitEvent(Base):
    __tablename__ = "visit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    frame_id = Column(UUID(as_uuid=True), nullable=False, unique=True)
    gate_id = Column(UUID(as_uuid=True), ForeignKey("gates.id"), nullable=False)
    captured_at = Column(DateTime(timezone=True), nullable=False)
    person_id = Column(UUID(as_uuid=True))
    status = Column(String(32), nullable=False, default="unknown")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
