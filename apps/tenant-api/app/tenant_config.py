from __future__ import annotations

import os
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TenantConfig
from .secret_store import SecretStoreError
from .tenant_db import get_secret_store

DEFAULT_CONFIG: dict[str, Any] = {
    "rekognition_min_confidence": 90,
    "dedupe_window_seconds": 300,
    "sms_enabled": True,
    "mnotify_sender_id": None,
    "absence_threshold_sessions": 6,
    "absence_threshold_weeks": 3,
    "absence_threshold_mode": "sessions",
    "welcome_cooldown_minutes": 1440,
    "followup_escalation_days": 3,
}


def get_config_value(session: Session, key: str, default: Any | None = None) -> Any:
    record = session.execute(
        select(TenantConfig).where(TenantConfig.key == key)
    ).scalar_one_or_none()
    if record:
        return record.value_json
    value = DEFAULT_CONFIG.get(key) if default is None else default
    if value is None:
        return None
    record = TenantConfig(key=key, value_json=value)
    session.add(record)
    session.commit()
    return value


def ensure_defaults(session: Session) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for key, default in DEFAULT_CONFIG.items():
        values[key] = get_config_value(session, key, default)
    return values


def list_config(session: Session) -> list[TenantConfig]:
    ensure_defaults(session)
    return session.execute(select(TenantConfig).order_by(TenantConfig.key)).scalars().all()


def set_config_value(session: Session, key: str, value: Any) -> TenantConfig:
    record = session.execute(
        select(TenantConfig).where(TenantConfig.key == key)
    ).scalar_one_or_none()
    if record:
        record.value_json = value
        session.add(record)
        session.commit()
        return record
    record = TenantConfig(key=key, value_json=value)
    session.add(record)
    session.commit()
    return record


def get_secret_config_value(session: Session, key: str) -> str | None:
    value = get_config_value(session, key)
    return resolve_secret_value(value)


def resolve_secret_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        if "value" in value:
            return str(value["value"])
        secret_ref = value.get("secret_ref")
        if secret_ref:
            try:
                secret = get_secret_store().get(secret_ref)
            except SecretStoreError:
                return None
            return secret
        env_key = value.get("env")
        if env_key:
            return os.environ.get(env_key)
    if isinstance(value, str):
        if value.startswith("env:"):
            return os.environ.get(value.split(":", 1)[1])
        return value
    return None
