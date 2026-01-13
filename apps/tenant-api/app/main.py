import base64
import hashlib
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .auth import get_current_user, get_gate_session
from .config import get_settings
from .crypto import encrypt_text, hash_text, normalize_phone
from .face_provider import PROVIDER_NAME, get_face_provider
from .logging_utils import clear_log_context, configure_logging, set_log_context
from .metrics import metrics_response, observe_request, record_task_result
from .tenant_config import list_config, set_config_value
from .models import (
    AuditLog,
    ConsentEvent,
    FaceProfile,
    FollowUpOutcome,
    FollowUpTask,
    Gate,
    GateAgentSession,
    IdempotencyKey,
    MessageLog,
    MessageTemplate,
    Person,
    RecognitionResult,
    Rule,
    RuleRun,
)
from .otel import setup_otel
from .tenancy import TenantResolutionError, get_tenant_context, resolve_tenant_from_request
from .tenant_db import get_tenant_session
from .worker import recognition_job, run_rule_job, send_message_job

settings = get_settings()
configure_logging("tenant-api", settings.log_level, settings.log_json)
logger = logging.getLogger(__name__)
setup_otel("tenant-api")
if settings.env != "dev" and settings.auth_mode == "dev":
    raise RuntimeError("AUTH_MODE=dev is not allowed outside dev")

app = FastAPI(title="Presence360 Tenant API", version="0.1.0")

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


public_router = APIRouter(prefix="/v1", dependencies=[Depends(rate_limit_stub)])
protected_router = APIRouter(
    prefix="/v1",
    dependencies=[Depends(get_current_user), Depends(rate_limit_stub)],
)
gate_public_router = APIRouter(prefix="/v1/gate", dependencies=[Depends(rate_limit_stub)])
gate_router = APIRouter(
    prefix="/v1/gate",
    dependencies=[Depends(get_gate_session), Depends(rate_limit_stub)],
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
        tenant_slug = getattr(getattr(request.state, "tenant", None), "slug", None)
        set_log_context(tenant_slug=tenant_slug)
        observe_request(
            "tenant-api",
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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _parse_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _hash_payload(
    frame_id: str,
    gate_id: str,
    captured_at: str,
    image_bytes: bytes,
    motion_score: float | None,
    face_present: bool | None,
) -> str:
    hasher = hashlib.sha256()
    hasher.update(frame_id.encode("utf-8"))
    hasher.update(b"|")
    hasher.update(gate_id.encode("utf-8"))
    hasher.update(b"|")
    hasher.update(captured_at.encode("utf-8"))
    hasher.update(b"|")
    if motion_score is not None:
        hasher.update(str(motion_score).encode("utf-8"))
    hasher.update(b"|")
    if face_present is not None:
        hasher.update(str(face_present).encode("utf-8"))
    hasher.update(b"|")
    hasher.update(image_bytes)
    return hasher.hexdigest()


def _parse_optional_bool(value: str | None) -> bool | None:
    if value is None or value == "":
        return None
    lowered = value.strip().lower()
    if lowered in {"true", "1", "yes", "y"}:
        return True
    if lowered in {"false", "0", "no", "n"}:
        return False
    raise ValueError("invalid boolean")


def _log_audit(
    session: Session,
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    metadata: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            id=uuid.uuid4(),
            actor_type="system",
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_json=metadata or {},
        )
    )


def _hash_message_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _render_template(template: MessageTemplate, context: dict[str, Any]) -> str:
    variables = template.variables_json or []
    if not isinstance(variables, list) or not all(
        isinstance(item, str) for item in variables
    ):
        raise HTTPException(
            status_code=422,
            detail="template variables_json must be list of strings",
        )
    missing = [name for name in variables if name not in context]
    if missing:
        raise HTTPException(status_code=422, detail=f"missing variables: {', '.join(missing)}")
    try:
        return template.body.format_map(context)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"missing variable: {exc.args[0]}") from exc


@app.middleware("http")
async def tenant_resolution_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if (
        path == "/healthz"
        or path == "/metrics"
        or path.startswith("/docs")
        or path.startswith("/openapi")
        or path.startswith("/redoc")
    ):
        return await call_next(request)
    try:
        request.state.tenant = resolve_tenant_from_request(request)
        set_log_context(tenant_slug=request.state.tenant.slug)
    except TenantResolutionError as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@public_router.post("/auth/login")
def login(payload: dict[str, Any] = Body(...)):
    return {"status": "ok", "details": payload}


@public_router.post("/auth/refresh")
def refresh(payload: dict[str, Any] = Body(...)):
    return {"status": "ok", "details": payload}


@protected_router.get("/tenant-info")
def tenant_info(request: Request):
    tenant = get_tenant_context(request)
    return {"slug": tenant.slug, "db_name": tenant.db_name}


@protected_router.post("/auth/logout")
def logout(payload: dict[str, Any] = Body(...)):
    return {"status": "ok", "details": payload}


@protected_router.get("/me")
def me():
    return {"user": "placeholder"}


@protected_router.get("/roles")
def list_roles():
    return {"items": []}


@protected_router.get("/permissions")
def list_permissions():
    return {"items": []}


@protected_router.post("/users")
def create_user(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.patch("/users/{user_id}/roles")
def update_user_roles(user_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": user_id, "status": "updated", "details": payload}


@protected_router.get("/config")
def get_config(session: Session = Depends(get_tenant_session)):
    records = list_config(session)
    return {
        "items": [
            {"key": record.key, "value": record.value_json}
            for record in records
        ]
    }


@protected_router.patch("/config")
def update_config(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    items = payload.get("items")
    if isinstance(items, list):
        updated = []
        for item in items:
            if not isinstance(item, dict) or "key" not in item:
                raise HTTPException(status_code=422, detail="items must include key")
            record = set_config_value(session, str(item["key"]), item.get("value"))
            updated.append({"key": record.key, "value": record.value_json})
        return {"items": updated}
    if "key" in payload:
        record = set_config_value(session, str(payload["key"]), payload.get("value"))
        return {"items": [{"key": record.key, "value": record.value_json}]}
    raise HTTPException(status_code=422, detail="items or key is required")


@protected_router.post("/people")
def create_person(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    name = payload.get("name") or payload.get("full_name")
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    consent_status = payload.get("consent_status") or "unknown"
    phone_raw = payload.get("phone")
    phone_enc = None
    phone_hash = None
    if phone_raw:
        normalized = normalize_phone(phone_raw)
        phone_enc = encrypt_text(normalized)
        phone_hash = hash_text(normalized)
    person = Person(
        id=uuid.uuid4(),
        full_name=name,
        consent_status=consent_status,
        phone_enc=phone_enc,
        phone_hash=phone_hash,
    )
    session.add(person)
    session.commit()
    return {
        "id": str(person.id),
        "full_name": person.full_name,
        "consent_status": person.consent_status,
    }


@protected_router.get("/people")
def list_people(session: Session = Depends(get_tenant_session)):
    people = session.execute(select(Person)).scalars().all()
    return {
        "items": [
            {
                "id": str(person.id),
                "full_name": person.full_name,
                "consent_status": person.consent_status,
            }
            for person in people
        ]
    }


@protected_router.get("/people/{person_id}")
def get_person(person_id: str, session: Session = Depends(get_tenant_session)):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    person = session.get(Person, person_uuid)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")
    return {
        "id": str(person.id),
        "full_name": person.full_name,
        "consent_status": person.consent_status,
    }


@protected_router.patch("/people/{person_id}")
def update_person(
    person_id: str,
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    person = session.get(Person, person_uuid)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")
    name = payload.get("name") or payload.get("full_name")
    if name:
        person.full_name = name
    if "phone" in payload:
        phone_raw = payload.get("phone")
        if phone_raw:
            normalized = normalize_phone(phone_raw)
            person.phone_enc = encrypt_text(normalized)
            person.phone_hash = hash_text(normalized)
        else:
            person.phone_enc = None
            person.phone_hash = None
    session.add(person)
    session.commit()
    return {"id": str(person.id), "status": "updated"}


@protected_router.post("/people/{person_id}/consent")
def update_consent(
    person_id: str,
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    person = session.get(Person, person_uuid)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")
    status_value = payload.get("status")
    if status_value not in {"consented", "revoked"}:
        raise HTTPException(status_code=422, detail="status must be consented or revoked")
    person.consent_status = status_value
    consent_event = ConsentEvent(
        id=uuid.uuid4(),
        person_id=person.id,
        status=status_value,
        source=payload.get("source") or "manual",
    )
    session.add(consent_event)
    _log_audit(
        session,
        action="consent.update",
        target_type="person",
        target_id=person.id,
        metadata={"status": status_value},
    )
    session.commit()
    return {"id": str(person.id), "status": status_value}


@protected_router.post("/people/{person_id}/faces")
def enroll_faces(
    request: Request,
    person_id: str,
    images: list[UploadFile] = File(...),
    consent_confirmed: str | None = Form(default=None),
    session: Session = Depends(get_tenant_session),
):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    person = session.get(Person, person_uuid)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")
    if person.consent_status != "consented":
        try:
            confirmed = _parse_optional_bool(consent_confirmed)
        except ValueError as exc:  # noqa: PERF203
            raise HTTPException(
                status_code=422,
                detail="consent_confirmed must be boolean",
            ) from exc
        if confirmed is not True:
            raise HTTPException(status_code=403, detail="consent required")
        person.consent_status = "consented"
        consent_event = ConsentEvent(
            id=uuid.uuid4(),
            person_id=person.id,
            status="consented",
            source="enrollment",
        )
        session.add(consent_event)
    else:
        consent_event = None

    tenant = get_tenant_context(request)
    collection_ref = tenant.tenant_id
    provider = get_face_provider(collection_ref)
    provider.ensure_collection()
    image_bytes_list = [image.file.read() for image in images]
    if not image_bytes_list:
        raise HTTPException(status_code=422, detail="images are required")
    result = provider.enroll(person.id, image_bytes_list)
    face_ids = result.get("face_ids", [])
    warnings = result.get("warnings", [])

    if not face_ids:
        raise HTTPException(status_code=422, detail="no faces detected")

    session.execute(
        update(FaceProfile)
        .where(FaceProfile.person_id == person.id)
        .where(FaceProfile.provider == PROVIDER_NAME)
        .where(FaceProfile.status == "active")
        .values(status="inactive")
    )

    for index, face_id in enumerate(face_ids):
        status = "active" if index == 0 else "inactive"
        session.add(
            FaceProfile(
                id=uuid.uuid4(),
                person_id=person.id,
                provider=PROVIDER_NAME,
                rekognition_face_id=face_id,
                collection_ref=collection_ref,
                status=status,
                consent_event_id=consent_event.id if consent_event else None,
            )
        )
    _log_audit(
        session,
        action="face.enroll",
        target_type="person",
        target_id=person.id,
        metadata={"face_count": len(face_ids)},
    )
    session.commit()
    return {"person_id": str(person.id), "face_ids": face_ids, "warnings": warnings}


@protected_router.get("/people/{person_id}/faces/status")
def face_status(person_id: str, session: Session = Depends(get_tenant_session)):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    profiles = session.execute(
        select(FaceProfile).where(FaceProfile.person_id == person_uuid)
    ).scalars()
    return {
        "person_id": person_id,
        "profiles": [
            {
                "id": str(profile.id),
                "provider": profile.provider,
                "face_id": profile.rekognition_face_id,
                "status": profile.status,
            }
            for profile in profiles
        ],
    }


@protected_router.delete("/people/{person_id}/faces")
def delete_faces(
    request: Request,
    person_id: str,
    session: Session = Depends(get_tenant_session),
):
    try:
        person_uuid = uuid.UUID(person_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
    person = session.get(Person, person_uuid)
    if not person:
        raise HTTPException(status_code=404, detail="person not found")

    profiles = session.execute(
        select(FaceProfile)
        .where(FaceProfile.person_id == person.id)
        .where(FaceProfile.provider == PROVIDER_NAME)
        .where(FaceProfile.status == "active")
    ).scalars().all()
    face_ids = [profile.rekognition_face_id for profile in profiles]

    if face_ids:
        tenant = get_tenant_context(request)
        collection_ref = tenant.tenant_id
        provider = get_face_provider(collection_ref)
        provider.ensure_collection()
        provider.delete_face_ids(face_ids)
        now = _utcnow()
        session.execute(
            update(FaceProfile)
            .where(FaceProfile.person_id == person.id)
            .where(FaceProfile.provider == PROVIDER_NAME)
            .where(FaceProfile.status == "active")
            .values(status="deleted", deleted_at=now)
        )
        person.consent_status = "revoked"
        consent_event = ConsentEvent(
            id=uuid.uuid4(),
            person_id=person.id,
            status="revoked",
            source="delete_faces",
        )
        session.add(consent_event)
        _log_audit(
            session,
            action="face.delete",
            target_type="person",
            target_id=person.id,
            metadata={"face_count": len(face_ids)},
        )
        session.commit()
    return {"person_id": str(person.id), "deleted_ids": face_ids}


@protected_router.post("/locations")
def create_location(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.get("/locations")
def list_locations():
    return {"items": []}


@protected_router.post("/gates")
def create_gate(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.get("/gates")
def list_gates():
    return {"items": []}


@protected_router.post("/cameras")
def create_camera(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.get("/cameras")
def list_cameras():
    return {"items": []}


@protected_router.post("/services")
def create_service(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.get("/services")
def list_services():
    return {"items": []}


@protected_router.post("/sessions")
def create_session(payload: dict[str, Any] = Body(...)):
    return {"status": "created", "details": payload}


@protected_router.get("/sessions")
def list_sessions():
    return {"items": []}


@protected_router.post("/sessions/{session_id}/start")
def start_session(session_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": session_id, "status": "started", "details": payload}


@protected_router.post("/sessions/{session_id}/stop")
def stop_session(session_id: str, payload: dict[str, Any] = Body(...)):
    return {"id": session_id, "status": "stopped", "details": payload}


@protected_router.get("/sessions/{session_id}/attendance")
def session_attendance(session_id: str):
    return {"id": session_id, "totals": {}}


@protected_router.get("/visits")
def list_visits():
    return {"items": []}


@protected_router.get("/visit-events")
def list_visit_events():
    return {"items": []}


@protected_router.get("/recognition-results")
def list_recognition_results(session: Session = Depends(get_tenant_session)):
    results = session.execute(
        select(RecognitionResult).order_by(RecognitionResult.processed_at.desc())
    ).scalars()
    items = []
    for record in results:
        items.append(
            {
                "frame_id": str(record.frame_id),
                "gate_id": str(record.gate_id),
                "person_id": str(record.person_id) if record.person_id else None,
                "decision": record.decision,
                "best_confidence": float(record.best_confidence)
                if record.best_confidence is not None
                else None,
                "best_face_id": record.best_face_id,
                "rejection_reason": record.rejection_reason,
                "processed_at": record.processed_at.isoformat()
                if record.processed_at
                else None,
            }
        )
    return {"items": items}


@protected_router.post("/rules")
def create_rule(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    name = payload.get("name")
    rule_type = payload.get("rule_type")
    if not name or not rule_type:
        raise HTTPException(status_code=422, detail="name and rule_type are required")
    rule = Rule(
        id=uuid.uuid4(),
        name=name,
        rule_type=rule_type,
        status=payload.get("status") or "active",
        config_json=payload.get("config") or {},
    )
    session.add(rule)
    session.commit()
    return {"id": str(rule.id), "status": rule.status}


@protected_router.get("/rules")
def list_rules(session: Session = Depends(get_tenant_session)):
    rules = session.execute(select(Rule)).scalars().all()
    return {
        "items": [
            {
                "id": str(rule.id),
                "name": rule.name,
                "rule_type": rule.rule_type,
                "status": rule.status,
                "config": rule.config_json or {},
            }
            for rule in rules
        ]
    }


@protected_router.post("/rules/{rule_id}/run")
def run_rule(
    rule_id: str,
    payload: dict[str, Any] = Body(default={}),
    session: Session = Depends(get_tenant_session),
    request: Request = None,
):
    try:
        rule_uuid = uuid.UUID(rule_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="rule_id must be a UUID") from exc
    rule = session.get(Rule, rule_uuid)
    if not rule:
        raise HTTPException(status_code=404, detail="rule not found")
    run = RuleRun(
        id=uuid.uuid4(),
        rule_id=rule.id,
        run_at=_utcnow(),
        status="queued",
        stats_json={},
    )
    session.add(run)
    session.commit()
    tenant = get_tenant_context(request)
    run_rule_job.delay(tenant.slug, str(rule.id), str(run.id))
    record_task_result("tenant-api", "run_rule_job", "queued")
    return {"run_id": str(run.id), "status": "queued"}


@protected_router.get("/followups")
def list_followups(
    status: str | None = Query(default=None),
    session: Session = Depends(get_tenant_session),
):
    query = select(FollowUpTask)
    if status:
        query = query.where(FollowUpTask.status == status)
    tasks = session.execute(query.order_by(FollowUpTask.created_at.desc())).scalars()
    return {
        "items": [
            {
                "id": str(task.id),
                "person_id": str(task.person_id),
                "rule_id": str(task.rule_id) if task.rule_id else None,
                "status": task.status,
                "priority": task.priority,
                "due_at": task.due_at.isoformat() if task.due_at else None,
                "assigned_to_user_id": str(task.assigned_to_user_id)
                if task.assigned_to_user_id
                else None,
            }
            for task in tasks
        ]
    }


@protected_router.patch("/followups/{followup_id}")
def update_followup(
    followup_id: str,
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    try:
        task_uuid = uuid.UUID(followup_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="followup_id must be a UUID") from exc
    task = session.get(FollowUpTask, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="followup not found")
    status_value = payload.get("status")
    if status_value:
        task.status = status_value
        if status_value in {"closed", "resolved"}:
            task.closed_at = _utcnow()
    if "notes" in payload:
        task.notes = payload.get("notes")
    outcome_type = payload.get("outcome_type")
    if outcome_type:
        outcome = FollowUpOutcome(
            id=uuid.uuid4(),
            task_id=task.id,
            outcome_type=outcome_type,
            notes=payload.get("outcome_notes"),
            recorded_by_user_id=None,
        )
        session.add(outcome)
    session.add(task)
    session.commit()
    return {"id": str(task.id), "status": task.status}


@protected_router.post("/messages/send")
def send_message(
    request: Request,
    payload: dict[str, Any] = Body(...),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: Session = Depends(get_tenant_session),
):
    channel = payload.get("channel") or "sms"
    if channel != "sms":
        raise HTTPException(status_code=422, detail="only sms channel is supported")
    person_id = payload.get("person_id")
    to_phone = payload.get("to_phone")
    if not person_id and not to_phone:
        raise HTTPException(status_code=422, detail="person_id or to_phone is required")
    if person_id and to_phone:
        raise HTTPException(status_code=422, detail="provide person_id or to_phone, not both")

    person = None
    if person_id:
        try:
            person_uuid = uuid.UUID(person_id)
        except ValueError as exc:  # noqa: PERF203
            raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
        person = session.get(Person, person_uuid)
        if not person:
            raise HTTPException(status_code=404, detail="person not found")
        if person.consent_status != "consented":
            raise HTTPException(status_code=403, detail="person has not consented")
        if not person.phone_enc:
            raise HTTPException(status_code=422, detail="person phone not set")
        to_phone_enc = person.phone_enc
        to_phone_hash = person.phone_hash
    else:
        normalized = normalize_phone(to_phone)
        to_phone_enc = encrypt_text(normalized)
        to_phone_hash = hash_text(normalized)

    template_id = payload.get("template_id")
    template = None
    body = payload.get("body")
    if template_id:
        try:
            template_uuid = uuid.UUID(template_id)
        except ValueError as exc:  # noqa: PERF203
            raise HTTPException(status_code=422, detail="template_id must be a UUID") from exc
        template = session.get(MessageTemplate, template_uuid)
        if not template or not template.active:
            raise HTTPException(status_code=404, detail="template not found")
        context = payload.get("context") or {}
        if not isinstance(context, dict):
            raise HTTPException(status_code=422, detail="context must be object")
        body = _render_template(template, context)
    if not body:
        raise HTTPException(status_code=422, detail="body is required")

    request_hash = _hash_message_payload(
        {
            "person_id": str(person.id) if person else None,
            "to_phone_hash": to_phone_hash,
            "template_id": str(template.id) if template else None,
            "channel": channel,
            "body": body,
        }
    )
    if idempotency_key:
        key = f"message_send:{idempotency_key}"
        existing = session.execute(
            select(IdempotencyKey).where(IdempotencyKey.key == key)
        ).scalar_one_or_none()
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=409, detail="idempotency key reused")
            return {"message_log_id": existing.response_ref, "status": "queued", "idempotent": True}

    log = MessageLog(
        id=uuid.uuid4(),
        person_id=person.id if person else None,
        template_id=template.id if template else None,
        channel=channel,
        to_phone_enc=to_phone_enc,
        to_phone_hash=to_phone_hash,
        status="queued",
    )
    session.add(log)
    session.flush()
    if idempotency_key:
        session.add(
            IdempotencyKey(
                id=uuid.uuid4(),
                scope="message_send",
                key=f"message_send:{idempotency_key}",
                request_hash=request_hash,
                response_ref=str(log.id),
                status="accepted",
            )
        )
    session.commit()
    tenant = get_tenant_context(request)
    send_message_job.delay(tenant.slug, str(log.id), body)
    record_task_result("tenant-api", "send_message_job", "queued")
    return {"message_log_id": str(log.id), "status": "queued"}


@protected_router.get("/messages/logs")
def list_message_logs(
    status: str | None = Query(default=None),
    person_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_tenant_session),
):
    query = select(MessageLog)
    if status:
        query = query.where(MessageLog.status == status)
    if person_id:
        try:
            person_uuid = uuid.UUID(person_id)
        except ValueError as exc:  # noqa: PERF203
            raise HTTPException(status_code=422, detail="person_id must be a UUID") from exc
        query = query.where(MessageLog.person_id == person_uuid)
    logs = session.execute(
        query.order_by(MessageLog.created_at.desc()).limit(limit).offset(offset)
    ).scalars()
    return {
        "items": [
            {
                "id": str(log.id),
                "person_id": str(log.person_id) if log.person_id else None,
                "template_id": str(log.template_id) if log.template_id else None,
                "channel": log.channel,
                "status": log.status,
                "provider_message_id": log.provider_message_id,
                "sent_at": log.sent_at.isoformat() if log.sent_at else None,
                "error_code": log.error_code,
            }
            for log in logs
        ]
    }


@protected_router.post("/templates")
def create_template(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    name = payload.get("name")
    channel = payload.get("channel") or "sms"
    body = payload.get("body")
    if not name or not body:
        raise HTTPException(status_code=422, detail="name and body are required")
    variables = payload.get("variables_json") or []
    if variables and (
        not isinstance(variables, list)
        or not all(isinstance(v, str) for v in variables)
    ):
        raise HTTPException(status_code=422, detail="variables_json must be list of strings")
    template = MessageTemplate(
        id=uuid.uuid4(),
        name=name,
        channel=channel,
        body=body,
        variables_json=variables,
        active=payload.get("active", True),
        created_by_user_id=None,
    )
    session.add(template)
    session.commit()
    return {"id": str(template.id), "status": "created"}


@protected_router.get("/templates")
def list_templates(session: Session = Depends(get_tenant_session)):
    templates = session.execute(select(MessageTemplate)).scalars().all()
    return {
        "items": [
            {
                "id": str(template.id),
                "name": template.name,
                "channel": template.channel,
                "body": template.body,
                "variables_json": template.variables_json,
                "active": template.active,
            }
            for template in templates
        ]
    }


@protected_router.get("/audit")
def list_audit_logs():
    return {"items": []}


@protected_router.get("/exports/sessions/{session_id}.csv")
def export_session_csv(session_id: str):
    content = "session_id\n" + f"{session_id}\n"
    return PlainTextResponse(content, media_type="text/csv")


@protected_router.get("/realtime/sessions/{session_id}/stream")
def realtime_stream(session_id: str):
    content = f"event: ready\ndata: {{\"session_id\": \"{session_id}\"}}\n\n"
    return PlainTextResponse(content, media_type="text/event-stream")


@gate_public_router.post("/auth/session")
def gate_auth_session(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_tenant_session),
):
    gate_id = payload.get("gate_id")
    bootstrap_token = payload.get("bootstrap_token")
    if not gate_id:
        raise HTTPException(status_code=422, detail="gate_id is required")
    if not bootstrap_token:
        raise HTTPException(status_code=422, detail="bootstrap_token is required")
    try:
        gate_uuid = uuid.UUID(str(gate_id))
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="gate_id must be a UUID") from exc

    gate = session.execute(select(Gate).where(Gate.id == gate_uuid)).scalar_one_or_none()
    if not gate or gate.status != "active":
        raise HTTPException(status_code=403, detail="gate not authorized")

    settings = get_settings()
    if not settings.gate_bootstrap_token or bootstrap_token != settings.gate_bootstrap_token:
        raise HTTPException(status_code=401, detail="invalid bootstrap token")
    auth_method = "bootstrap_token"
    bootstrap_hash = _hash_token(bootstrap_token)
    existing = session.execute(
        select(GateAgentSession).where(GateAgentSession.bootstrap_token_hash == bootstrap_hash)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="bootstrap token already used")

    session_token = secrets.token_urlsafe(32)
    now = _utcnow()
    expires_at = now + timedelta(seconds=settings.gate_session_ttl_seconds)
    session.execute(
        update(GateAgentSession)
        .where(GateAgentSession.gate_id == gate_uuid)
        .where(GateAgentSession.status == "active")
        .values(status="revoked")
    )
    gate_session = GateAgentSession(
        id=uuid.uuid4(),
        gate_id=gate_uuid,
        session_token_hash=_hash_token(session_token),
        bootstrap_token_hash=bootstrap_hash,
        auth_method=auth_method,
        status="active",
        issued_at=now,
        expires_at=expires_at,
        last_seen_at=now,
    )
    session.add(gate_session)
    session.commit()
    return {
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "heartbeat_interval_sec": settings.gate_heartbeat_interval_seconds,
        "clock_skew_ms": 0,
    }


@gate_router.post("/heartbeat")
def gate_heartbeat(
    payload: dict[str, Any] = Body(...),
    gate_session: GateAgentSession = Depends(get_gate_session),
    session: Session = Depends(get_tenant_session),
):
    gate_id = payload.get("gate_id")
    if gate_id:
        try:
            gate_uuid = uuid.UUID(str(gate_id))
        except ValueError as exc:  # noqa: PERF203
            raise HTTPException(status_code=422, detail="gate_id must be a UUID") from exc
        if gate_session.gate_id != gate_uuid:
            raise HTTPException(status_code=403, detail="gate not authorized")
    gate_session.last_seen_at = _utcnow()
    session.add(gate_session)
    session.commit()
    return {
        "accepted": True,
        "details": payload,
        "server_time": _utcnow().isoformat(),
    }


@gate_router.post("/frames")
def gate_frames(
    request: Request,
    frame_id: str = Form(...),
    gate_id: str = Form(...),
    captured_at: str = Form(...),
    image: UploadFile = File(...),
    motion_score: str | None = Form(default=None),
    face_present: str | None = Form(default=None),
    gate_session: GateAgentSession = Depends(get_gate_session),
    session: Session = Depends(get_tenant_session),
):
    try:
        frame_uuid = uuid.UUID(frame_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="frame_id must be a UUID") from exc
    try:
        gate_uuid = uuid.UUID(gate_id)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="gate_id must be a UUID") from exc

    if gate_session.gate_id != gate_uuid:
        raise HTTPException(status_code=403, detail="gate not authorized")

    gate = session.execute(select(Gate).where(Gate.id == gate_uuid)).scalar_one_or_none()
    if not gate or gate.status != "active":
        raise HTTPException(status_code=403, detail="gate not authorized")

    settings = get_settings()
    now = _utcnow()
    if gate_session.last_frame_at:
        delta = (now - gate_session.last_frame_at).total_seconds()
        if (
            settings.gate_frame_cooldown_seconds > 0
            and delta < settings.gate_frame_cooldown_seconds
        ):
            raise HTTPException(status_code=429, detail="cooldown active")

    try:
        captured_dt = _parse_datetime(captured_at)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="captured_at must be ISO8601") from exc
    try:
        motion_score_value = float(motion_score) if motion_score is not None else None
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="motion_score must be numeric") from exc
    try:
        face_present_value = _parse_optional_bool(face_present)
    except ValueError as exc:  # noqa: PERF203
        raise HTTPException(status_code=422, detail="face_present must be boolean") from exc

    image_bytes = image.file.read()
    request_hash = _hash_payload(
        frame_id,
        gate_id,
        captured_dt.isoformat(),
        image_bytes,
        motion_score_value,
        face_present_value,
    )

    existing = session.execute(
        select(IdempotencyKey).where(IdempotencyKey.key == frame_id)
    ).scalar_one_or_none()
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(
                status_code=409,
                detail="frame_id already used with different payload",
            )
        return {
            "accepted": True,
            "frame_id": frame_id,
            "job_id": existing.response_ref,
            "idempotent": True,
        }

    job_id = str(uuid.uuid4())
    idempotency = IdempotencyKey(
        id=uuid.uuid4(),
        scope="visit_event",
        key=frame_id,
        request_hash=request_hash,
        response_ref=job_id,
        status="pending",
    )
    gate_session.last_frame_at = now
    gate_session.last_seen_at = now
    session.add(idempotency)
    session.add(gate_session)
    session.commit()

    tenant = get_tenant_context(request)
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    recognition_job.delay(
        tenant.slug,
        str(frame_uuid),
        str(gate_uuid),
        captured_dt.isoformat(),
        request_hash,
        job_id,
        image_b64,
        str(gate_session.id),
        face_present_value,
        motion_score_value,
    )
    record_task_result("tenant-api", "recognition_job", "queued")
    return {"accepted": True, "frame_id": frame_id, "job_id": job_id}


@gate_router.post("/events")
def gate_events(payload: dict[str, Any] = Body(...)):
    return {"accepted": True, "details": payload}


@app.websocket("/v1/realtime")
async def realtime_socket(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"status": "ok"})
    await websocket.close()


app.include_router(public_router)
app.include_router(protected_router)
app.include_router(gate_public_router)
app.include_router(gate_router)
