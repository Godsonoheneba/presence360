import hashlib
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import GateAgentSession
from .tenant_db import get_tenant_session


def get_current_user(authorization: str | None = Header(default=None)):
    settings = get_settings()
    if settings.auth_mode != "dev":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not settings.auth_dev_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured",
        )
    if authorization != f"Bearer {settings.auth_dev_token}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return {"role": "user"}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_gate_session(
    authorization: str | None = Header(default=None),
    gate_session_header: str | None = Header(default=None, alias="X-Gate-Session"),
    session: Session = Depends(get_tenant_session),
) -> GateAgentSession:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token and gate_session_header:
        token = gate_session_header.strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    token_hash = _hash_token(token)
    gate_session = session.execute(
        select(GateAgentSession).where(GateAgentSession.session_token_hash == token_hash)
    ).scalar_one_or_none()
    if not gate_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if gate_session.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Session revoked")
    if gate_session.expires_at <= _utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return gate_session
