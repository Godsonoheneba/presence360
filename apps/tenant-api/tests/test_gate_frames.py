import os
import uuid

import app.tenant_registry as tenant_registry
import app.worker as worker
import httpx
from app.config import get_settings
from app.db import Base
from app.models import Gate, IdempotencyKey, RecognitionResult, VisitEvent
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


def test_gate_frames_idempotency(monkeypatch, tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "dev"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    os.environ["GATE_BOOTSTRAP_TOKEN"] = "test-bootstrap"
    os.environ["GATE_FRAME_COOLDOWN_SECONDS"] = "0"
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
    gate_id = uuid.uuid4()
    try:
        Base.metadata.create_all(bind=session.get_bind())
        session.add(Gate(id=gate_id, name="Front Gate", status="active"))
        session.commit()
    finally:
        session.close()

    from app.main import app

    client = TestClient(app)
    response = client.post(
        "/v1/gate/auth/session",
        headers={"X-Tenant-Slug": "grace"},
        json={"gate_id": str(gate_id), "bootstrap_token": "test-bootstrap"},
    )
    assert response.status_code == 200
    auth_payload = response.json()
    session_token = auth_payload["session_token"]
    assert "heartbeat_interval_sec" in auth_payload
    assert "clock_skew_ms" in auth_payload

    heartbeat = client.post(
        "/v1/gate/heartbeat",
        headers={"X-Tenant-Slug": "grace", "X-Gate-Session": session_token},
        json={"gate_id": str(gate_id), "status": "ok"},
    )
    assert heartbeat.status_code == 200
    assert heartbeat.json()["accepted"] is True

    frame_id = uuid.uuid4()
    files = {
        "frame_id": (None, str(frame_id)),
        "gate_id": (None, str(gate_id)),
        "captured_at": (None, "2025-01-12T10:00:00Z"),
        "motion_score": (None, "0.12"),
        "face_present": (None, "false"),
        "image": ("frame.jpg", b"fake-image-bytes", "image/jpeg"),
    }
    first = client.post(
        "/v1/gate/frames",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {session_token}"},
        files=files,
    )
    assert first.status_code == 200
    job_id = first.json()["job_id"]

    second = client.post(
        "/v1/gate/frames",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {session_token}"},
        files=files,
    )
    assert second.status_code == 200
    assert second.json()["job_id"] == job_id
    assert second.json().get("idempotent") is True

    files_conflict = {
        "frame_id": (None, str(frame_id)),
        "gate_id": (None, str(gate_id)),
        "captured_at": (None, "2025-01-12T10:00:00Z"),
        "image": ("frame.jpg", b"different-bytes", "image/jpeg"),
    }
    conflict = client.post(
        "/v1/gate/frames",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {session_token}"},
        files=files_conflict,
    )
    assert conflict.status_code == 409

    session = manager.get_session(tenant)
    try:
        recognition = session.execute(
            select(RecognitionResult).where(RecognitionResult.frame_id == frame_id)
        ).scalar_one_or_none()
        assert recognition is not None
        assert recognition.decision == "unknown"
        assert recognition.rejection_reason == "no_face"
        assert recognition.metadata_json["job_id"] == job_id
        assert "image" not in recognition.metadata_json
        visit = session.execute(
            select(VisitEvent).where(VisitEvent.frame_id == frame_id)
        ).scalar_one_or_none()
        assert visit is not None
        assert visit.person_id is None
        idem = session.execute(
            select(IdempotencyKey).where(IdempotencyKey.key == str(frame_id))
        ).scalar_one_or_none()
        assert idem is not None
        assert idem.status == "succeeded"
    finally:
        session.close()
