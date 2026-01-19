import json
import os
import socket
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import URL, make_url

os.environ["ENV"] = "dev"
os.environ["AUTH_MODE"] = "dev"
os.environ["AUTH_DEV_TOKEN"] = os.environ.get("AUTH_DEV_TOKEN", "dev-tenant")
os.environ["GATE_BOOTSTRAP_TOKEN"] = os.environ.get("GATE_BOOTSTRAP_TOKEN", "test-bootstrap")
os.environ["GATE_FRAME_COOLDOWN_SECONDS"] = "0"
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "true"
os.environ["CELERY_TASK_EAGER_PROPAGATES"] = "true"
os.environ["PROVIDER_MODE"] = "mock"
os.environ["REKOGNITION_MODE"] = "mock"
os.environ["MOCK_FACE_CONFIDENCE"] = os.environ.get("MOCK_FACE_CONFIDENCE", "99")
os.environ["METRICS_ENABLED"] = "false"


def _load_env() -> None:
    env_path = None
    for parent in [Path(__file__).resolve()] + list(Path(__file__).resolve().parents):
        candidate = parent / ".env"
        if candidate.exists():
            env_path = candidate
            break
    if env_path:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            if not os.environ.get(key):
                os.environ[key] = value


def _normalize_host(url: URL) -> URL:
    host = url.host or "localhost"
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
    admin_url = os.environ.get("POSTGRES_ADMIN_URL")
    if not admin_url:
        base_url = os.environ.get("TENANT_DATABASE_URL") or os.environ.get(
            "CONTROL_PLANE_DATABASE_URL", ""
        )
        if not base_url:
            raise RuntimeError("POSTGRES_ADMIN_URL is not configured")
        admin_url = str(make_url(base_url).set(database="postgres"))
    return _to_psycopg_dsn(admin_url)


def _create_tenant_db(admin_dsn: str, slug: str) -> dict[str, str]:
    tenant_id = uuid.uuid4().hex
    db_name = f"tenant_{slug}_{tenant_id}"
    db_user = db_name
    password = f"pass_{tenant_id}"
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (db_user,))
            if not cur.fetchone():
                cur.execute(
                    sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                        sql.Identifier(db_user), sql.Literal(password)
                    )
                )
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            if not cur.fetchone():
                cur.execute(
                    sql.SQL("CREATE DATABASE {} OWNER {}").format(
                        sql.Identifier(db_name), sql.Identifier(db_user)
                    )
                )
    return {"db_name": db_name, "db_user": db_user, "password": password}


def _drop_tenant_db(admin_dsn: str, db_name: str, db_user: str) -> None:
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s",
                (db_name,),
            )
            cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(db_name)))
            cur.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(db_user)))


@pytest.fixture(scope="module")
def tenant_registry_payload(tmp_path_factory):
    _load_env()
    admin_dsn = _admin_dsn()
    host = make_url(os.environ["POSTGRES_ADMIN_URL"]).host or "localhost"
    host = _normalize_host(make_url(os.environ["POSTGRES_ADMIN_URL"])).host or host
    port = str(make_url(os.environ["POSTGRES_ADMIN_URL"]).port or 5432)

    tenant_payloads: dict[str, dict[str, str]] = {}
    secrets: dict[str, dict[str, str]] = {}
    created = []
    for slug in ("grace", "joy"):
        db_info = _create_tenant_db(admin_dsn, slug)
        secret_ref = f"local:tenant_db:{db_info['db_name']}"
        secrets[secret_ref] = {
            "username": db_info["db_user"],
            "password": db_info["password"],
        }
        tenant_payloads[slug] = {
            "tenant_id": str(uuid.uuid4()),
            "slug": slug,
            "db_name": db_info["db_name"],
            "db_host": host,
            "db_port": port,
            "db_user": db_info["db_user"],
            "secret_ref": secret_ref,
            "tls_mode": "disable",
            "status": "active",
        }
        created.append(db_info)

    secret_file = tmp_path_factory.mktemp("secrets") / "tenant_db.json"
    secret_file.write_text(json.dumps(secrets), encoding="utf-8")

    yield tenant_payloads, secret_file

    for entry in created:
        _drop_tenant_db(admin_dsn, entry["db_name"], entry["db_user"])
