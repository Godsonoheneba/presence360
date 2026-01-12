import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from .db import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(64), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="provisioning")
    provisioning_state = Column(String(32), nullable=False, default="provisioning")
    idempotency_key = Column(String(128), unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TenantDbConnection(Base):
    __tablename__ = "tenant_db_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    db_host = Column(String(255), nullable=False)
    db_port = Column(String(16), nullable=False)
    db_name = Column(String(128), nullable=False)
    db_user = Column(String(128), nullable=False)
    secret_ref = Column(String(255), nullable=False)
    state = Column(String(32), nullable=False, default="active")
    is_primary = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GlobalAuditLog(Base):
    __tablename__ = "global_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_type = Column(String(32), nullable=False)
    actor_id = Column(UUID(as_uuid=True))
    tenant_id = Column(UUID(as_uuid=True))
    action = Column(String(128), nullable=False)
    target_type = Column(String(64), nullable=False)
    target_id = Column(UUID(as_uuid=True))
    metadata_json = Column(JSONB)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SupportAccessLog(Base):
    __tablename__ = "support_access_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    support_user_id = Column(UUID(as_uuid=True), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    reason = Column(Text, nullable=False)
    approval_ticket = Column(String(128))
    access_mode = Column(String(32), nullable=False)
    session_id = Column(String(128), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True))
