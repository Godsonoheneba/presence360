from __future__ import annotations

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
        return _extract_secret_value(data.get(secret_ref))


@dataclass
class EnvSecretStore:
    prefix: str = "TENANT_SECRET_"
    fallback_store: FileSecretStore | None = None

    def get(self, secret_ref: str) -> str:
        env_key = _env_key_from_ref(secret_ref, self.prefix)
        if env_key:
            value = os.environ.get(env_key)
            if value:
                return value
        if self.fallback_store is not None:
            return self.fallback_store.get(secret_ref)
        raise SecretStoreError("Secret ref not found", status_code=404)


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
