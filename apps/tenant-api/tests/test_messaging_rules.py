import os
import uuid
from datetime import datetime, timedelta, timezone

import app.tenant_registry as tenant_registry
import app.worker as worker
import httpx
from app.config import get_settings
from app.db import Base
from app.models import FollowUpTask, Gate, MessageLog, RuleRun, TenantConfig, VisitEvent
from app.tenancy import TenantContext
from app.tenant_db import get_session_manager
from app.tenant_registry import TenantRegistryClient
from fastapi.testclient import TestClient
from sqlalchemy import select


def _make_registry_client(payloads: dict[str, dict[str, str]]):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-internal-token") == "test-internal"
        assert request.url.path == "/v1/tenants/resolve"
        slug = request.url.params.get("slug")
        if slug not in payloads:
            return httpx.Response(404, json={"detail": "not found"})
        return httpx.Response(200, json=payloads[slug])

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="http://control-plane.internal")
    return TenantRegistryClient(
        base_url="http://control-plane.internal",
        token="test-internal",
        cache_ttl_seconds=60,
        client=client,
    )


def _setup_tenant(monkeypatch, tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "dev"
    os.environ["AUTH_MODE"] = "dev"
    os.environ["AUTH_DEV_TOKEN"] = "dev-tenant"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    os.environ["CELERY_TASK_ALWAYS_EAGER"] = "true"
    os.environ["CELERY_TASK_EAGER_PROPAGATES"] = "true"
    os.environ["MESSAGING_MODE"] = "mock"
    get_settings.cache_clear()
    get_session_manager.cache_clear()

    registry_client = _make_registry_client(payloads)
    monkeypatch.setattr(tenant_registry, "get_registry_client", lambda: registry_client)
    import app.tenancy as tenancy
    monkeypatch.setattr(tenancy, "get_registry_client", lambda: registry_client)
    monkeypatch.setattr(worker, "get_registry_client", lambda: registry_client)

    worker.celery_app.conf.task_always_eager = True
    worker.celery_app.conf.task_eager_propagates = True

    payload = payloads["grace"]
    tenant = TenantContext(
        tenant_id=payload["tenant_id"],
        slug=payload["slug"],
        db_name=payload["db_name"],
        db_host=payload["db_host"],
        db_port=payload["db_port"],
        db_user=payload["db_user"],
        secret_ref=payload["secret_ref"],
        tls_mode=payload["tls_mode"],
        status=payload["status"],
    )
    manager = get_session_manager()
    session = manager.get_session(tenant)
    try:
        Base.metadata.create_all(bind=session.get_bind())
    finally:
        session.close()
    return tenant


def test_manual_send_idempotency(monkeypatch, tenant_registry_payload):
    tenant = _setup_tenant(monkeypatch, tenant_registry_payload)
    from app.main import app

    client = TestClient(app)
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")
    person_resp = client.post(
        "/v1/people",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={
            "name": "Message Person",
            "consent_status": "consented",
            "phone": "+233555000111",
        },
    )
    assert person_resp.status_code == 200
    person_id = person_resp.json()["id"]

    payload = {"person_id": person_id, "body": "Hello there"}
    first = client.post(
        "/v1/messages/send",
        headers={
            "X-Tenant-Slug": "grace",
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "msg-001",
        },
        json=payload,
    )
    assert first.status_code == 200
    message_log_id = first.json()["message_log_id"]

    second = client.post(
        "/v1/messages/send",
        headers={
            "X-Tenant-Slug": "grace",
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "msg-001",
        },
        json=payload,
    )
    assert second.status_code == 200
    assert second.json()["message_log_id"] == message_log_id
    assert second.json().get("idempotent") is True

    conflict = client.post(
        "/v1/messages/send",
        headers={
            "X-Tenant-Slug": "grace",
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "msg-001",
        },
        json={"person_id": person_id, "body": "Different body"},
    )
    assert conflict.status_code == 409

    manager = get_session_manager()
    session = manager.get_session(tenant)
    try:
        log = session.get(MessageLog, uuid.UUID(message_log_id))
        assert log is not None
        assert log.status == "sent"
    finally:
        session.close()


def test_welcome_rule_sends_message(monkeypatch, tenant_registry_payload):
    tenant = _setup_tenant(monkeypatch, tenant_registry_payload)
    from app.main import app

    client = TestClient(app)
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")

    template = client.post(
        "/v1/templates",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={
            "name": "welcome_default",
            "channel": "sms",
            "body": "Welcome {first_name}",
            "variables_json": ["first_name"],
        },
    )
    assert template.status_code == 200

    person_resp = client.post(
        "/v1/people",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={
            "name": "Welcome Person",
            "consent_status": "consented",
            "phone": "+233555000222",
        },
    )
    person_id = uuid.UUID(person_resp.json()["id"])

    manager = get_session_manager()
    session = manager.get_session(tenant)
    gate_id = uuid.uuid4()
    try:
        session.add(Gate(id=gate_id, name="Gate", status="active"))
        session.add(
            VisitEvent(
                id=uuid.uuid4(),
                frame_id=uuid.uuid4(),
                gate_id=gate_id,
                captured_at=datetime.now(timezone.utc),
                person_id=person_id,
                status="matched",
            )
        )
        session.commit()
    finally:
        session.close()

    rule = client.post(
        "/v1/rules",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={"name": "Welcome Rule", "rule_type": "welcome"},
    )
    assert rule.status_code == 200
    rule_id = rule.json()["id"]

    run = client.post(
        f"/v1/rules/{rule_id}/run",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={},
    )
    assert run.status_code == 200

    session = manager.get_session(tenant)
    try:
        logs = session.execute(select(MessageLog)).scalars().all()
        assert logs
        assert logs[0].status == "sent"
        runs = session.execute(select(RuleRun)).scalars().all()
        assert runs
        assert runs[0].status == "completed"
    finally:
        session.close()


def test_absence_rule_creates_followup(monkeypatch, tenant_registry_payload):
    tenant = _setup_tenant(monkeypatch, tenant_registry_payload)
    from app.main import app

    client = TestClient(app)
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")

    client.post(
        "/v1/templates",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={
            "name": "absence_default",
            "channel": "sms",
            "body": "We missed you {first_name}",
            "variables_json": ["first_name"],
        },
    )

    person_resp = client.post(
        "/v1/people",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={
            "name": "Absent Person",
            "consent_status": "consented",
            "phone": "+233555000333",
        },
    )
    person_id = uuid.UUID(person_resp.json()["id"])

    manager = get_session_manager()
    session = manager.get_session(tenant)
    gate_id = uuid.uuid4()
    try:
        session.add(Gate(id=gate_id, name="Gate", status="active"))
        session.add(
            VisitEvent(
                id=uuid.uuid4(),
                frame_id=uuid.uuid4(),
                gate_id=gate_id,
                captured_at=datetime.now(timezone.utc) - timedelta(days=30),
                person_id=person_id,
                status="matched",
            )
        )
        session.add(TenantConfig(key="absence_threshold_mode", value_json="weeks"))
        session.add(TenantConfig(key="absence_threshold_weeks", value_json=1))
        session.commit()
    finally:
        session.close()

    rule = client.post(
        "/v1/rules",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={"name": "Absence Rule", "rule_type": "absence"},
    )
    rule_id = rule.json()["id"]
    run = client.post(
        f"/v1/rules/{rule_id}/run",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        json={},
    )
    assert run.status_code == 200

    session = manager.get_session(tenant)
    try:
        tasks = session.execute(select(FollowUpTask)).scalars().all()
        assert tasks
        logs = (
            session.execute(select(MessageLog).where(MessageLog.person_id == person_id))
            .scalars()
            .all()
        )
        assert logs
        assert logs[0].status == "sent"
    finally:
        session.close()
