from __future__ import annotations

import ipaddress
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from .config import get_settings
from .tenant_registry import TenantRegistryError, get_registry_client


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    slug: str
    db_name: str
    db_host: str
    db_port: str
    db_user: str
    secret_ref: str
    tls_mode: str
    status: str


class TenantResolutionError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def get_tenant_context(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant missing")
    return tenant


def resolve_tenant_from_request(request: Request) -> TenantContext:
    settings = get_settings()
    slug = _resolve_slug(request, settings.env)
    registry = get_registry_client()
    try:
        record = registry.get_tenant(slug)
    except TenantRegistryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return TenantContext(
        tenant_id=record.tenant_id,
        slug=record.slug,
        db_name=record.db_name,
        db_host=record.db_host,
        db_port=record.db_port,
        db_user=record.db_user,
        secret_ref=record.secret_ref,
        tls_mode=record.tls_mode,
        status=record.status,
    )


def _resolve_slug(request: Request, env: str) -> str:
    header_slug = request.headers.get("x-tenant-slug")
    if env == "dev" and header_slug:
        return header_slug.strip().lower()

    host_header = request.headers.get("host", "")
    host = host_header.split(":", 1)[0].lower()
    if not host:
        raise TenantResolutionError("Host header missing", status_code=400)
    if host in {"localhost", "127.0.0.1"}:
        raise TenantResolutionError("Tenant subdomain required", status_code=400)
    try:
        ipaddress.ip_address(host)
        raise TenantResolutionError("Tenant subdomain required", status_code=400)
    except ValueError:
        pass
    if "." not in host:
        raise TenantResolutionError("Tenant subdomain required", status_code=400)
    slug = host.split(".", 1)[0]
    if not slug:
        raise TenantResolutionError("Tenant subdomain required", status_code=400)
    return slug
