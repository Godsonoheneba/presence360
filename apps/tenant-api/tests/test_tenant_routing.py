import os

import app.tenant_registry as tenant_registry
import httpx
from app.config import get_settings
from app.tenancy import TenantContext
from app.tenant_db import get_session_manager
from app.tenant_registry import TenantRegistryClient
from fastapi.testclient import TestClient
from sqlalchemy import text


def _make_registry_client(payloads: dict[str, dict[str, str]], call_counter: dict[str, int]):
    def handler(request: httpx.Request) -> httpx.Response:
        call_counter["count"] += 1
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


def _auth_header() -> dict[str, str]:
    token = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")
    return {"Authorization": f"Bearer {token}"}


def test_tenant_info_header_and_cache(monkeypatch, tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "dev"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    get_settings.cache_clear()
    get_session_manager.cache_clear()

    call_counter = {"count": 0}
    registry_client = _make_registry_client(payloads, call_counter)
    monkeypatch.setattr(tenant_registry, "get_registry_client", lambda: registry_client)
    import app.tenancy as tenancy
    monkeypatch.setattr(tenancy, "get_registry_client", lambda: registry_client)

    from app.main import app

    client = TestClient(app)
    response = client.get(
        "/v1/tenant-info",
        headers={
            "X-Tenant-Slug": "grace",
            **_auth_header(),
        },
    )
    assert response.status_code == 200
    assert response.json()["db_name"] == payloads["grace"]["db_name"]

    response_repeat = client.get(
        "/v1/tenant-info",
        headers={
            "X-Tenant-Slug": "grace",
            **_auth_header(),
        },
    )
    assert response_repeat.status_code == 200
    assert call_counter["count"] == 1


def test_tenant_info_subdomain(monkeypatch, tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "dev"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    get_settings.cache_clear()
    get_session_manager.cache_clear()

    call_counter = {"count": 0}
    registry_client = _make_registry_client(payloads, call_counter)
    monkeypatch.setattr(tenant_registry, "get_registry_client", lambda: registry_client)
    import app.tenancy as tenancy
    monkeypatch.setattr(tenancy, "get_registry_client", lambda: registry_client)

    from app.main import app

    client = TestClient(app)
    response = client.get(
        "/v1/tenant-info",
        headers={
            "Host": "joy.localtest.me",
            **_auth_header(),
        },
    )
    assert response.status_code == 200
    assert response.json()["db_name"] == payloads["joy"]["db_name"]


def test_header_rejected_in_prod(monkeypatch, tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "prod"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    get_settings.cache_clear()
    get_session_manager.cache_clear()

    call_counter = {"count": 0}
    registry_client = _make_registry_client(payloads, call_counter)
    monkeypatch.setattr(tenant_registry, "get_registry_client", lambda: registry_client)
    import app.tenancy as tenancy
    monkeypatch.setattr(tenancy, "get_registry_client", lambda: registry_client)

    from app.main import app

    client = TestClient(app)
    response = client.get(
        "/v1/tenant-info",
        headers={
            "X-Tenant-Slug": "grace",
            **_auth_header(),
        },
    )
    assert response.status_code == 400


def test_tenant_session_uses_correct_db(tenant_registry_payload):
    payloads, secret_file = tenant_registry_payload
    os.environ["ENV"] = "dev"
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = str(secret_file)
    get_settings.cache_clear()
    get_session_manager.cache_clear()

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
        db_name = session.execute(text("select current_database()")).scalar_one()
    finally:
        session.close()
    assert db_name == payload["db_name"]
