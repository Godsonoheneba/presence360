import json
import os
import re
from dataclasses import dataclass
from typing import Protocol


class SecretStoreError(RuntimeError):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


class SecretStore(Protocol):
    def get(self, secret_ref: str) -> str:
        raise NotImplementedError


@dataclass
class FileSecretStore:
    path: str

    def get(self, secret_ref: str) -> str:
        if not os.path.exists(self.path):
            raise SecretStoreError("Secret store file not found", status_code=503)
        with open(self.path, "r", encoding="utf-8") as handle:
            try:
                data = json.load(handle)
            except json.JSONDecodeError as exc:  # noqa: PERF203
                raise SecretStoreError("Secret store is invalid", status_code=500) from exc
        if secret_ref not in data:
            raise SecretStoreError("Secret ref not found", status_code=404)
        value = data.get(secret_ref)
        return _extract_secret_value(value)

    def store_tenant_db_credentials(self, tenant_id: str, password: str) -> str:
        ref = f"local:tenant_db:{tenant_id}"
        dir_path = os.path.dirname(self.path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        data: dict[str, object] = {}
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as handle:
                try:
                    data = json.load(handle)
                except json.JSONDecodeError:
                    data = {}
        data[ref] = password
        tmp_path = f"{self.path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump(data, handle)
        os.replace(tmp_path, self.path)
        os.chmod(self.path, 0o600)
        return ref


@dataclass
class EnvSecretStore:
    prefix: str = "TENANT_SECRET_"

    def get(self, secret_ref: str) -> str:
        env_key = _env_key_from_ref(secret_ref, self.prefix)
        if env_key and os.environ.get(env_key):
            return os.environ[env_key]
        raise SecretStoreError("Secret ref not found", status_code=404)

    def tenant_db_password_ref(self) -> str:
        return "tenant_db_password"


@dataclass
class InMemorySecretStore:
    data: dict[str, object]

    def get(self, secret_ref: str) -> str:
        if secret_ref not in self.data:
            raise SecretStoreError("Secret ref not found", status_code=404)
        return _extract_secret_value(self.data.get(secret_ref))


def _env_key_from_ref(secret_ref: str, prefix: str) -> str | None:
    if not secret_ref:
        return None
    if secret_ref.startswith("env:"):
        return secret_ref.split(":", 1)[1]
    if secret_ref.startswith(prefix):
        return secret_ref
    normalized = re.sub(r"[^A-Z0-9]+", "_", secret_ref.strip().upper())
    if not normalized:
        return None
    return f"{prefix}{normalized}"


def _extract_secret_value(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("password", "value", "secret", "api_key"):
            if key in value:
                return str(value[key])
    raise SecretStoreError("Secret value is invalid", status_code=500)
