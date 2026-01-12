import os
import socket
from pathlib import Path

from sqlalchemy.engine import make_url


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

    base_url = None
    if os.environ.get("CONTROL_PLANE_DATABASE_URL"):
        base_url = make_url(os.environ["CONTROL_PLANE_DATABASE_URL"])
        try:
            socket.gethostbyname(base_url.host or "")
        except socket.gaierror:
            base_url = base_url.set(host="localhost")
        if not os.environ.get("DATABASE_URL"):
            os.environ["DATABASE_URL"] = base_url.render_as_string(hide_password=False)

    if os.environ.get("POSTGRES_ADMIN_URL"):
        admin_url = make_url(os.environ["POSTGRES_ADMIN_URL"])
        try:
            socket.gethostbyname(admin_url.host or "")
        except socket.gaierror:
            admin_url = admin_url.set(host="localhost")
        os.environ["POSTGRES_ADMIN_URL"] = admin_url.render_as_string(
            hide_password=False
        )
    elif base_url is not None:
        os.environ["POSTGRES_ADMIN_URL"] = base_url.set(
            database="postgres"
        ).render_as_string(hide_password=False)

    os.environ.setdefault("AUTH_DEV_SUPER_TOKEN", "dev-super")
    os.environ["SECRET_STORE_BACKEND"] = "file"
    os.environ["SECRET_STORE_PATH"] = ".secrets/tenant_db.json"
    os.environ.setdefault("REKOGNITION_MODE", "mock")


_load_env()
