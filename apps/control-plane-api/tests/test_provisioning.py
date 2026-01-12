import os
import socket
import uuid

import psycopg
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient
from psycopg import sql
from sqlalchemy.engine import URL, make_url


def _normalize_host(url: URL) -> URL:
    host = url.host or "localhost"
    if host == "localhost":
        return url
    try:
        socket.gethostbyname(host)
        return url
    except socket.gaierror:
        return url.set(host="localhost")


def _to_psycopg_dsn(url: str) -> str:
    parsed = make_url(url)
    parsed = _normalize_host(parsed)
    return parsed.set(drivername="postgresql").render_as_string(hide_password=False)


def _admin_dsn() -> str:
    return _to_psycopg_dsn(os.environ["POSTGRES_ADMIN_URL"])


def _control_plane_dsn() -> str:
    return _to_psycopg_dsn(os.environ["CONTROL_PLANE_DATABASE_URL"])


def test_tenant_provisioning_idempotent():
    client = TestClient(app)
    slug = f"test-{uuid.uuid4().hex[:8]}"
    idempotency_key = uuid.uuid4().hex
    admin_email = f"admin-{uuid.uuid4().hex[:8]}@example.com"
    tenant_id = None
    db_name = None

    payload = {
        "slug": slug,
        "name": "Test Church",
        "admin_email": admin_email,
    }
    headers = {
        "Authorization": f"Bearer {os.environ['AUTH_DEV_SUPER_TOKEN']}",
        "Idempotency-Key": idempotency_key,
    }

    response = client.post("/v1/tenants", json=payload, headers=headers)
    assert response.status_code in (200, 201)
    data = response.json()

    tenant_id = data["tenant_id"]
    db_name = data["db_name"]

    response_repeat = client.post("/v1/tenants", json=payload, headers=headers)
    assert response_repeat.status_code == 200
    assert response_repeat.json()["tenant_id"] == tenant_id

    admin_dsn = _admin_dsn()
    control_dsn = _control_plane_dsn()

    try:
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
                assert cur.fetchone() is not None

                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (db_name,))
                assert cur.fetchone() is not None

        with psycopg.connect(control_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT db_user, secret_ref FROM tenant_db_connections WHERE tenant_id = %s",
                    (tenant_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] == db_name
                assert row[1]

        tenant_admin_url = make_url(os.environ["POSTGRES_ADMIN_URL"]).set(database=db_name)
        tenant_admin_dsn = _to_psycopg_dsn(
            tenant_admin_url.render_as_string(hide_password=False)
        )
        with psycopg.connect(tenant_admin_dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM alembic_version")
                assert cur.fetchone() is not None
                cur.execute("SELECT 1 FROM users WHERE email = %s", (admin_email,))
                assert cur.fetchone() is not None
    finally:
        if tenant_id:
            with psycopg.connect(control_dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM tenant_db_connections WHERE tenant_id = %s", (tenant_id,)
                    )
                    cur.execute("DELETE FROM global_audit_logs WHERE tenant_id = %s", (tenant_id,))
                    cur.execute("DELETE FROM tenants WHERE id = %s", (tenant_id,))
                conn.commit()
        if db_name:
            with psycopg.connect(admin_dsn, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                        (db_name,),
                    )
                    cur.execute(
                        sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db_name))
                    )
                    cur.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(db_name)))
