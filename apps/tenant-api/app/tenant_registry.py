from __future__ import annotations

import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import httpx

from .config import get_settings


@dataclass(frozen=True)
class TenantRegistryRecord:
    tenant_id: str
    slug: str
    db_name: str
    db_host: str
    db_port: str
    db_user: str
    secret_ref: str
    tls_mode: str
    status: str


class TenantRegistryError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class TenantRegistryClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        cache_ttl_seconds: int = 30,
        client: Optional[httpx.Client] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._cache_ttl_seconds = max(cache_ttl_seconds, 0)
        self._client = client or httpx.Client(timeout=5.0, base_url=self._base_url)
        self._cache: dict[str, tuple[float, TenantRegistryRecord]] = {}

    def get_tenant(self, slug: str) -> TenantRegistryRecord:
        slug = slug.strip().lower()
        cached = self._cache.get(slug)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]

        record = self._fetch_tenant(slug)
        if self._cache_ttl_seconds > 0:
            self._cache[slug] = (now + self._cache_ttl_seconds, record)
        return record

    def _fetch_tenant(self, slug: str) -> TenantRegistryRecord:
        headers: dict[str, str] = {}
        if self._token:
            headers["X-Internal-Token"] = self._token
        response = self._client.get(
            "/v1/tenants/resolve", headers=headers, params={"slug": slug}
        )
        if response.status_code == 404:
            raise TenantRegistryError("Tenant not found", status_code=404)
        if response.status_code >= 400:
            raise TenantRegistryError(
                f"Tenant registry lookup failed ({response.status_code})", status_code=502
            )
        data = response.json()
        return TenantRegistryRecord(
            tenant_id=data["tenant_id"],
            slug=data["slug"],
            db_name=data["db_name"],
            db_host=data["db_host"],
            db_port=str(data["db_port"]),
            db_user=data["db_user"],
            secret_ref=data["secret_ref"],
            tls_mode=data.get("tls_mode", "disable"),
            status=data.get("status", "unknown"),
        )


@lru_cache
def get_registry_client() -> TenantRegistryClient:
    settings = get_settings()
    if not settings.control_plane_api_url:
        raise TenantRegistryError("CONTROL_PLANE_API_URL is not configured", status_code=500)
    return TenantRegistryClient(
        base_url=settings.control_plane_api_url,
        token=settings.control_plane_internal_token,
        cache_ttl_seconds=settings.tenant_registry_cache_ttl_seconds,
    )


def clear_registry_client_cache() -> None:
    get_registry_client.cache_clear()
