import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_internal_service, get_super_admin
from .config import get_settings
from .db import get_session
from .logging_utils import clear_log_context, configure_logging, set_log_context
from .metrics import metrics_response, observe_request
from .models import Tenant, TenantDbConnection
from .otel import setup_otel
from .provisioning import ProvisioningError, get_provisioner
from .schemas import TenantCreateRequest, TenantProvisionResponse, TenantRegistryResponse

settings = get_settings()
configure_logging("control-plane-api", settings.log_level, settings.log_json)
logger = logging.getLogger(__name__)
setup_otel("control-plane-api")
if settings.env != "dev" and settings.auth_mode == "dev":
    raise RuntimeError("AUTH_MODE=dev is not allowed outside dev")

app = FastAPI(title="Presence360 Control Plane API", version="0.1.0")


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _cors_origins() -> list[str]:
    raw = settings.cors_allow_origins
    if settings.env == "dev" and not raw:
        return ["*"]
    origins = _parse_csv(raw) if raw else []
    if settings.env != "dev" and "*" in origins:
        raise RuntimeError("Wildcard CORS is not allowed outside dev")
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=_parse_csv(settings.cors_allow_methods),
    allow_headers=_parse_csv(settings.cors_allow_headers),
    allow_credentials=settings.cors_allow_credentials,
)


def rate_limit_stub(_: Request) -> None:
    return None


router = APIRouter(
    prefix="/v1",
    dependencies=[Depends(get_super_admin), Depends(rate_limit_stub)],
)
internal_router = APIRouter(
    prefix="/v1/tenants",
    dependencies=[Depends(get_internal_service), Depends(rate_limit_stub)],
)


@app.middleware("http")
async def request_size_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
        except ValueError:
            return PlainTextResponse("Invalid Content-Length", status_code=400)
        if length > settings.max_request_size_bytes:
            return PlainTextResponse("Request too large", status_code=413)
    return await call_next(request)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    set_log_context(request_id=request_id)
    start = time.monotonic()
    status_code = 500
    response = None
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        duration = time.monotonic() - start
        observe_request(
            "control-plane-api",
            request.method,
            request.url.path,
            status_code,
            duration,
        )
        logger.info(
            "request.completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "duration_ms": int(duration * 1000),
            },
        )
        clear_log_context()
        if response is not None:
            response.headers["X-Request-Id"] = request_id


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'"
    if settings.env != "dev":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return metrics_response()


@router.post("/tenants", response_model=TenantProvisionResponse)
def create_tenant(
    payload: TenantCreateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: Session = Depends(get_session),
):
    provisioner = get_provisioner()
    try:
        result = provisioner.provision(
            session=session,
            slug=payload.slug,
            name=payload.name,
            admin_email=payload.admin_email,
            idempotency_key=idempotency_key,
        )
    except ProvisioningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc

    response = TenantProvisionResponse(
        tenant_id=str(result.tenant.id),
        slug=result.tenant.slug,
        provisioning_state=result.tenant.provisioning_state,
        db_name=f"tenant_{result.tenant.id}",
    )
    status_code = status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
    return JSONResponse(status_code=status_code, content=response.model_dump())


@router.get("/tenants")
def list_tenants():
    return {"items": []}


@router.get("/tenants/{tenant_id}")
def get_tenant(tenant_id: str):
    return {"id": tenant_id}


def _resolve_tenant_record(slug: str, session: Session) -> TenantRegistryResponse:
    slug = slug.strip().lower()
    stmt = (
        select(TenantDbConnection, Tenant)
        .join(Tenant, TenantDbConnection.tenant_id == Tenant.id)
        .where(Tenant.slug == slug)
        .where(TenantDbConnection.is_primary.is_(True))
        .where(TenantDbConnection.state == "active")
    )
    row = session.execute(stmt).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    connection, tenant = row
    if tenant.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant not active")
    return TenantRegistryResponse(
        tenant_id=str(tenant.id),
        slug=tenant.slug,
        db_name=connection.db_name,
        db_host=connection.db_host,
        db_port=connection.db_port,
        db_user=connection.db_user,
        secret_ref=connection.secret_ref,
        tls_mode="disable",
        status=tenant.status,
    )


@internal_router.get("/resolve", response_model=TenantRegistryResponse)
def resolve_tenant(slug: str, session: Session = Depends(get_session)):
    return _resolve_tenant_record(slug, session)


@internal_router.get("/registry/{slug}", response_model=TenantRegistryResponse)
def registry_lookup(slug: str, session: Session = Depends(get_session)):
    return _resolve_tenant_record(slug, session)


@router.post("/tenants/{tenant_id}/suspend")
def suspend_tenant(tenant_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": tenant_id, "status": "suspended", "details": payload}


@router.post("/tenants/{tenant_id}/unsuspend")
def unsuspend_tenant(tenant_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": tenant_id, "status": "active", "details": payload}


@router.post("/tenants/{tenant_id}/rotate-secrets")
def rotate_tenant_secrets(tenant_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": tenant_id, "status": "queued", "details": payload}


@router.get("/tenants/{tenant_id}/health")
def tenant_health(tenant_id: str):
    return {"id": tenant_id, "status": "ok"}


@router.get("/tenants/{tenant_id}/usage")
def tenant_usage(tenant_id: str):
    return {"id": tenant_id, "metrics": []}


@router.post("/support/impersonate")
def support_impersonate(payload: dict[str, Any] = Body(...)):
    return {"status": "active", "details": payload}


@router.post("/support/impersonate/end")
def support_impersonate_end(payload: dict[str, Any] = Body(...)):
    return {"status": "ended", "details": payload}


app.include_router(internal_router)
app.include_router(router)
