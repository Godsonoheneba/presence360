import os
import uuid

import app.tenant_registry as tenant_registry
import app.worker as worker
import httpx
from app.config import get_settings
from app.db import Base
from app.face_provider import clear_face_provider_cache
from app.models import FaceProfile, Gate, Person, RecognitionResult, VisitEvent
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
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    os.environ["PROVIDER_MODE"] = "mock"
    os.environ["REKOGNITION_MODE"] = "mock"
    get_settings.cache_clear()
    get_session_manager.cache_clear()
    clear_face_provider_cache()

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


def test_enroll_and_match(monkeypatch, tenant_registry_payload):
    os.environ["MOCK_FACE_CONFIDENCE"] = "99"
    bootstrap_token = f"test-bootstrap-{uuid.uuid4()}"
    os.environ["GATE_BOOTSTRAP_TOKEN"] = bootstrap_token
    tenant = _setup_tenant(monkeypatch, tenant_registry_payload)

    manager = get_session_manager()
    session = manager.get_session(tenant)
    gate_id = uuid.uuid4()
    person_id = uuid.uuid4()
    try:
        session.add(Gate(id=gate_id, name="Front Gate", status="active"))
        session.add(Person(id=person_id, full_name="Test Person", consent_status="consented"))
        session.commit()
    finally:
        session.close()

    from app.main import app

    client = TestClient(app)
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")
    enroll = client.post(
        f"/v1/people/{person_id}/faces",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        files=[
            ("images", ("face1.jpg", b"face-image-1", "image/jpeg")),
            ("images", ("face2.jpg", b"face-image-2", "image/jpeg")),
            ("images", ("face3.jpg", b"face-image-3", "image/jpeg")),
        ],
    )
    assert enroll.status_code == 200
    face_ids = enroll.json()["face_ids"]
    assert face_ids

    auth = client.post(
        "/v1/gate/auth/session",
        headers={"X-Tenant-Slug": "grace"},
        json={"gate_id": str(gate_id), "bootstrap_token": bootstrap_token},
    )
    assert auth.status_code == 200
    session_token = auth.json()["session_token"]

    frame_id = uuid.uuid4()
    frame = client.post(
        "/v1/gate/frames",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {session_token}"},
        files={
            "frame_id": (None, str(frame_id)),
            "gate_id": (None, str(gate_id)),
            "captured_at": (None, "2025-01-12T10:00:00Z"),
            "face_present": (None, "true"),
            "image": ("frame.jpg", b"face-image", "image/jpeg"),
        },
    )
    assert frame.status_code == 200

    session = manager.get_session(tenant)
    try:
        recognition = session.execute(
            select(RecognitionResult).where(RecognitionResult.frame_id == frame_id)
        ).scalar_one()
        assert recognition.decision == "matched"
        assert recognition.person_id == person_id
        visit = session.execute(
            select(VisitEvent).where(VisitEvent.frame_id == frame_id)
        ).scalar_one()
        assert visit.person_id == person_id
        profile = session.execute(select(FaceProfile)).scalar_one()
        assert profile.person_id == person_id
    finally:
        session.close()


def test_below_threshold_and_delete_idempotent(monkeypatch, tenant_registry_payload):
    os.environ["MOCK_FACE_CONFIDENCE"] = "50"
    bootstrap_token = f"test-bootstrap-{uuid.uuid4()}"
    os.environ["GATE_BOOTSTRAP_TOKEN"] = bootstrap_token
    tenant = _setup_tenant(monkeypatch, tenant_registry_payload)

    manager = get_session_manager()
    session = manager.get_session(tenant)
    gate_id = uuid.uuid4()
    person_id = uuid.uuid4()
    try:
        session.add(Gate(id=gate_id, name="Side Gate", status="active"))
        session.add(Person(id=person_id, full_name="Low Confidence", consent_status="consented"))
        session.commit()
    finally:
        session.close()

    from app.main import app

    client = TestClient(app)
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")
    enroll = client.post(
        f"/v1/people/{person_id}/faces",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
        files=[("images", ("face.jpg", b"low-face", "image/jpeg"))],
    )
    assert enroll.status_code == 200
    face_ids = enroll.json()["face_ids"]

    auth = client.post(
        "/v1/gate/auth/session",
        headers={"X-Tenant-Slug": "grace"},
        json={"gate_id": str(gate_id), "bootstrap_token": bootstrap_token},
    )
    session_token = auth.json()["session_token"]

    frame_id = uuid.uuid4()
    frame = client.post(
        "/v1/gate/frames",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {session_token}"},
        files={
            "frame_id": (None, str(frame_id)),
            "gate_id": (None, str(gate_id)),
            "captured_at": (None, "2025-01-12T10:00:00Z"),
            "face_present": (None, "true"),
            "image": ("frame.jpg", b"low-face", "image/jpeg"),
        },
    )
    assert frame.status_code == 200

    session = manager.get_session(tenant)
    try:
        recognition = session.execute(
            select(RecognitionResult).where(RecognitionResult.frame_id == frame_id)
        ).scalar_one()
        assert recognition.decision == "unknown"
        assert recognition.rejection_reason == "below_threshold"
        visit = session.execute(
            select(VisitEvent).where(VisitEvent.frame_id == frame_id)
        ).scalar_one()
        assert visit.person_id is None
    finally:
        session.close()

    delete_first = client.delete(
        f"/v1/people/{person_id}/faces",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
    )
    assert delete_first.status_code == 200
    assert delete_first.json()["deleted_ids"] == face_ids

    delete_second = client.delete(
        f"/v1/people/{person_id}/faces",
        headers={"X-Tenant-Slug": "grace", "Authorization": f"Bearer {token}"},
    )
    assert delete_second.status_code == 200
    assert delete_second.json()["deleted_ids"] == []
