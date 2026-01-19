import base64
import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

from celery import Celery
from celery.signals import worker_ready
from prometheus_client import start_http_server
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from .config import get_settings
from .crypto import decrypt_text
from .face_provider import PROVIDER_NAME, ProviderNotConfiguredError, get_face_provider
from .logging_utils import clear_log_context, configure_logging, set_log_context
from .messaging_provider import get_messaging_provider
from .metrics import record_message_send, record_recognition_decision, record_task_result
from .models import (
    FaceProfile,
    FollowUpTask,
    IdempotencyKey,
    MessageLog,
    MessageTemplate,
    Person,
    RecognitionResult,
    Role,
    Rule,
    RuleRun,
    UserRole,
    VisitEvent,
)
from .otel import setup_otel
from .secret_store import SecretStoreError
from .tenancy import TenantContext
from .tenant_config import get_config_value, get_secret_config_value
from .tenant_db import get_session_manager
from .tenant_registry import get_registry_client

settings = get_settings()
log_file_path = settings.log_file_path or os.path.join("logs", "dev-tenant-worker.jsonl")
configure_logging(
    "tenant-worker",
    settings.log_level,
    settings.log_json,
    log_to_file=settings.log_to_file and settings.env == "dev",
    log_file_path=log_file_path,
)
logger = logging.getLogger(__name__)
setup_otel("tenant-worker")

celery_app = Celery("tenant_worker", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_always_eager = settings.celery_task_always_eager
celery_app.conf.task_eager_propagates = settings.celery_task_eager_propagates


@worker_ready.connect
def _start_metrics_server(**_: object) -> None:
    if not settings.metrics_enabled:
        return
    if settings.metrics_port <= 0:
        return
    start_http_server(settings.metrics_port)
    logger.info("metrics.server_started", extra={"port": settings.metrics_port})


def _parse_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _build_tenant_context(tenant_slug: str) -> TenantContext:
    record = get_registry_client().get_tenant(tenant_slug)
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


def _hash_message_payload(parts: list[str]) -> str:
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _render_template(template: MessageTemplate, context: dict[str, str]) -> str:
    variables = template.variables_json or []
    if not isinstance(variables, list) or not all(isinstance(item, str) for item in variables):
        raise ValueError("template variables_json must be list of strings")
    missing = [name for name in variables if name not in context]
    if missing:
        raise ValueError(f"missing variables: {', '.join(missing)}")
    return template.body.format_map(context)


def _default_context(person: Person) -> dict[str, str]:
    full_name = person.full_name or ""
    first_name = full_name.split(" ", 1)[0] if full_name else ""
    return {"full_name": full_name, "first_name": first_name}


def _select_template(session, template_name: str) -> MessageTemplate | None:
    return session.execute(
        select(MessageTemplate)
        .where(MessageTemplate.name == template_name)
        .where(MessageTemplate.active.is_(True))
    ).scalar_one_or_none()


def _queue_message(
    session,
    *,
    person: Person | None,
    template: MessageTemplate | None,
    body: str,
    channel: str,
    idempotency_key: str,
    request_hash: str,
    to_phone_enc: str,
    to_phone_hash: str | None,
) -> uuid.UUID | None:
    existing = session.execute(
        select(IdempotencyKey).where(IdempotencyKey.key == idempotency_key)
    ).scalar_one_or_none()
    if existing:
        if existing.request_hash != request_hash:
            return None
        return uuid.UUID(existing.response_ref)
    log_id = uuid.uuid4()
    log = MessageLog(
        id=log_id,
        person_id=person.id if person else None,
        template_id=template.id if template else None,
        channel=channel,
        to_phone_enc=to_phone_enc,
        to_phone_hash=to_phone_hash,
        status="queued",
    )
    session.add(log)
    session.add(
        IdempotencyKey(
            id=uuid.uuid4(),
            scope="message_send",
            key=idempotency_key,
            request_hash=request_hash,
            response_ref=str(log_id),
            status="accepted",
        )
    )
    return log_id


def _select_escalation_user(session) -> uuid.UUID | None:
    for role_name in ("Pastor", "BranchAdmin"):
        user_id = session.execute(
            select(UserRole.user_id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == role_name)
            .where(UserRole.is_active.is_(True))
            .limit(1)
        ).scalar_one_or_none()
        if user_id:
            return user_id
    return None


@celery_app.task
def recognition_job(
    tenant_slug: str,
    frame_id: str,
    gate_id: str,
    captured_at: str,
    request_hash: str,
    job_id: str,
    image_b64: str,
    session_id: str | None = None,
    face_present: bool | None = None,
    motion_score: float | None = None,
) -> str:
    start = time.monotonic()
    set_log_context(request_id=frame_id, tenant_slug=tenant_slug)
    context = _build_tenant_context(tenant_slug)
    try:
        session = get_session_manager().get_session(context)
    except SecretStoreError as exc:
        logger.error("secret_store_error", extra={"error": str(exc)})
        record_task_result("tenant-worker", "recognition_job", "error")
        clear_log_context()
        return job_id
    captured_dt = _parse_datetime(captured_at)
    gate_uuid = uuid.UUID(gate_id)
    frame_uuid = uuid.UUID(frame_id)
    session_uuid = uuid.UUID(session_id) if session_id else None
    try:
        threshold = get_config_value(session, "recognition_threshold", None)
        if threshold is not None:
            min_confidence = float(threshold)
            if min_confidence <= 1:
                min_confidence *= 100
        else:
            min_confidence = float(get_config_value(session, "rekognition_min_confidence", 90))
        _ = get_config_value(session, "dedupe_window_seconds", 300)
        collection_ref = context.tenant_id
        best_face_id = None
        best_confidence = None
        matches: list[dict[str, float | str]] = []
        decision = "unknown"
        rejection_reason = None
        person_id = None
        provider_code = None
        if face_present is False:
            rejection_reason = "no_face"
        else:
            try:
                provider = get_face_provider(collection_ref)
                provider.ensure_collection()
            except ProviderNotConfiguredError as exc:
                logger.error(
                    "rekognition.not_configured",
                    extra={"missing": exc.missing, "collection_ref": collection_ref},
                )
                decision = "error"
                rejection_reason = "error"
                provider_code = exc.error_code
            else:
                try:
                    image_bytes = base64.b64decode(image_b64.encode("ascii"))
                    # Guardrail: never persist raw image bytes.
                    result = provider.recognize(image_bytes)
                    del image_bytes
                    best_face_id = result.best_face_id
                    best_confidence = result.best_confidence
                    matches = [
                        {"face_id": match.face_id, "confidence": match.confidence}
                        for match in result.matches
                    ]
                    if best_face_id and best_confidence is not None:
                        if best_confidence >= min_confidence:
                            profile = session.execute(
                                select(FaceProfile).where(
                                    FaceProfile.provider == PROVIDER_NAME,
                                    FaceProfile.rekognition_face_id == best_face_id,
                                    FaceProfile.status == "active",
                                )
                            ).scalar_one_or_none()
                            if profile:
                                decision = "matched"
                                person_id = profile.person_id
                            else:
                                rejection_reason = "no_match"
                        else:
                            rejection_reason = "below_threshold"
                    else:
                        rejection_reason = "no_match"
                except Exception as exc:  # noqa: BLE001
                    decision = "error"
                    rejection_reason = "error"
                    provider_code = exc.__class__.__name__
        processed_at = datetime.now(timezone.utc)
        latency_ms = int((time.monotonic() - start) * 1000)
        recognition = RecognitionResult(
            id=uuid.uuid4(),
            frame_id=frame_uuid,
            gate_id=gate_uuid,
            session_id=session_uuid,
            processed_at=processed_at,
            latency_ms=latency_ms,
            best_confidence=best_confidence,
            best_face_id=best_face_id,
            person_id=person_id,
            decision=decision,
            rejection_reason=rejection_reason,
            provider_response_code=provider_code,
            metadata_json={
                "job_id": job_id,
                "request_hash": request_hash,
                "face_present": face_present,
                "motion_score": motion_score,
                "matches": matches,
            },
        )
        visit = VisitEvent(
            id=uuid.uuid4(),
            frame_id=frame_uuid,
            gate_id=gate_uuid,
            captured_at=captured_dt,
            person_id=person_id,
            status="matched" if person_id else "unknown",
        )
        session.add(recognition)
        session.add(visit)
        session.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.key == frame_id)
            .values(status="succeeded", response_ref=job_id)
        )
        session.commit()
        record_recognition_decision("tenant-worker", decision)
        record_task_result("tenant-worker", "recognition_job", "success")
    except IntegrityError:
        session.rollback()
        record_task_result("tenant-worker", "recognition_job", "error")
    finally:
        session.close()
        clear_log_context()
    return job_id


@celery_app.task
def send_message_job(tenant_slug: str, message_log_id: str, body: str | None = None) -> str:
    set_log_context(request_id=message_log_id, tenant_slug=tenant_slug)
    context = _build_tenant_context(tenant_slug)
    try:
        session = get_session_manager().get_session(context)
    except SecretStoreError as exc:
        logger.error("secret_store_error", extra={"error": str(exc)})
        record_task_result("tenant-worker", "send_message_job", "error")
        clear_log_context()
        return message_log_id
    log_uuid = uuid.UUID(message_log_id)
    try:
        log = session.get(MessageLog, log_uuid)
        if not log:
            record_task_result("tenant-worker", "send_message_job", "skipped")
            return message_log_id
        if log.status not in {"queued", "retry"}:
            record_task_result("tenant-worker", "send_message_job", "skipped")
            return message_log_id
        if not body:
            log.status = "failed"
            log.error_code = "missing_body"
            session.commit()
            record_message_send("tenant-worker", "failed")
            record_task_result("tenant-worker", "send_message_job", "error")
            return message_log_id

        to_phone_enc = log.to_phone_enc
        if not to_phone_enc and log.person_id:
            person = session.get(Person, log.person_id)
            if person:
                to_phone_enc = person.phone_enc
        if not to_phone_enc:
            log.status = "failed"
            log.error_code = "missing_phone"
            session.commit()
            record_message_send("tenant-worker", "failed")
            record_task_result("tenant-worker", "send_message_job", "error")
            return message_log_id

        try:
            to_phone = decrypt_text(to_phone_enc)
        except ValueError:
            log.status = "failed"
            log.error_code = "decrypt_error"
            session.commit()
            record_message_send("tenant-worker", "failed")
            record_task_result("tenant-worker", "send_message_job", "error")
            return message_log_id

        provider = get_messaging_provider()
        sender_id = get_config_value(session, "mnotify_sender_id")
        api_key = get_secret_config_value(session, "mnotify_api_key")
        if settings.provider_mode.lower() != "mock" and not api_key:
            logger.error(
                "messaging.not_configured",
                extra={"missing": "mnotify_api_key"},
            )
            log.status = "failed"
            log.error_code = "messaging_not_configured"
            session.commit()
            record_message_send("tenant-worker", "failed")
            record_task_result("tenant-worker", "send_message_job", "error")
            return message_log_id
        api_key = api_key or ""
        result = provider.send_sms(
            to_phone=to_phone,
            body=body,
            sender_id=sender_id,
            client_ref=message_log_id,
            api_key=api_key,
        )
        now = datetime.now(timezone.utc)
        if result.status == "sent":
            log.status = "sent"
            log.sent_at = now
            record_message_send("tenant-worker", "sent")
        else:
            log.status = "failed"
            record_message_send("tenant-worker", "failed")
        log.provider_message_id = result.provider_message_id
        log.cost_cents = result.cost_cents
        log.error_code = result.error_code
        log.provider_response_json = result.raw
        session.add(log)
        session.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.response_ref == message_log_id)
            .where(IdempotencyKey.scope == "message_send")
            .values(status="succeeded" if result.status == "sent" else "failed")
        )
        session.commit()
        record_task_result("tenant-worker", "send_message_job", log.status)
    finally:
        session.close()
        clear_log_context()
    return message_log_id


@celery_app.task
def run_rule_job(tenant_slug: str, rule_id: str, run_id: str) -> str:
    set_log_context(request_id=run_id, tenant_slug=tenant_slug)
    context = _build_tenant_context(tenant_slug)
    try:
        session = get_session_manager().get_session(context)
    except SecretStoreError as exc:
        logger.error("secret_store_error", extra={"error": str(exc)})
        record_task_result("tenant-worker", "run_rule_job", "error")
        clear_log_context()
        return run_id
    rule_uuid = uuid.UUID(rule_id)
    run_uuid = uuid.UUID(run_id)
    now = datetime.now(timezone.utc)
    queued: list[tuple[uuid.UUID, str]] = []
    run = None
    had_error = False
    try:
        rule = session.get(Rule, rule_uuid)
        run = session.get(RuleRun, run_uuid)
        if not rule or not run:
            record_task_result("tenant-worker", "run_rule_job", "skipped")
            return run_id
        if rule.status != "active":
            run.status = "skipped"
            session.add(run)
            session.commit()
            record_task_result("tenant-worker", "run_rule_job", "skipped")
            return run_id

        stats: dict[str, int | str] = {
            "candidates": 0,
            "messages_queued": 0,
            "messages_skipped": 0,
            "tasks_created": 0,
        }
        sms_enabled = bool(get_config_value(session, "sms_enabled", True))

        if rule.rule_type == "welcome":
            template_name = (rule.config_json or {}).get("template_name") or "welcome_default"
            template = _select_template(session, template_name)
            if not template:
                run.status = "completed"
                run.stats_json = {"template_missing": template_name}
                session.add(run)
                session.commit()
                return run_id

            cooldown_minutes = int(get_config_value(session, "welcome_cooldown_minutes", 1440))
            cutoff = now - timedelta(minutes=cooldown_minutes)

            rows = session.execute(
                select(Person)
                .join(VisitEvent, VisitEvent.person_id == Person.id)
                .where(VisitEvent.person_id.is_not(None))
                .distinct()
            ).scalars().all()
            stats["candidates"] = len(rows)
            for person in rows:
                if not sms_enabled or person.consent_status != "consented" or not person.phone_enc:
                    stats["messages_skipped"] += 1
                    continue
                recent = session.execute(
                    select(MessageLog)
                    .where(MessageLog.person_id == person.id)
                    .where(MessageLog.template_id == template.id)
                    .where(MessageLog.created_at >= cutoff)
                ).scalar_one_or_none()
                if recent:
                    stats["messages_skipped"] += 1
                    continue
                context_payload = _default_context(person)
                try:
                    body = _render_template(template, context_payload)
                except ValueError:
                    stats["messages_skipped"] += 1
                    continue
                key_hash = hashlib.sha256(
                    f"{person.id}:{template.id}:{run.id}:sms".encode("utf-8")
                ).hexdigest()
                idempotency_key = f"message_send:auto:{key_hash}"
                request_hash = _hash_message_payload(
                    [str(person.id), str(template.id), "sms", body]
                )
                log_id = _queue_message(
                    session,
                    person=person,
                    template=template,
                    body=body,
                    channel="sms",
                    idempotency_key=idempotency_key,
                    request_hash=request_hash,
                    to_phone_enc=person.phone_enc,
                    to_phone_hash=person.phone_hash,
                )
                if log_id:
                    queued.append((log_id, body))
                    stats["messages_queued"] += 1
                else:
                    stats["messages_skipped"] += 1

        elif rule.rule_type == "absence":
            mode = get_config_value(session, "absence_threshold_mode", "sessions")
            template_name = (rule.config_json or {}).get("template_name") or "absence_default"
            template = _select_template(session, template_name)

            candidates = session.execute(select(Person)).scalars().all()
            stats["candidates"] = len(candidates)
            threshold_sessions = int(get_config_value(session, "absence_threshold_sessions", 6))
            threshold_weeks = int(get_config_value(session, "absence_threshold_weeks", 3))
            escalation_days = int(get_config_value(session, "followup_escalation_days", 3))

            session_dates: list[datetime.date] = []
            if mode == "sessions" and threshold_sessions > 0:
                session_dates = session.execute(
                    select(func.date(VisitEvent.captured_at))
                    .where(VisitEvent.person_id.is_not(None))
                    .group_by(func.date(VisitEvent.captured_at))
                    .order_by(func.date(VisitEvent.captured_at).desc())
                    .limit(threshold_sessions)
                ).scalars().all()
            cutoff_date = now - timedelta(weeks=threshold_weeks)

            open_tasks = {
                task.person_id
                for task in session.execute(
                    select(FollowUpTask).where(
                        FollowUpTask.status.notin_(["closed", "resolved"])
                    )
                ).scalars()
            }

            for person in candidates:
                last_seen = session.execute(
                    select(func.max(VisitEvent.captured_at))
                    .where(VisitEvent.person_id == person.id)
                ).scalar_one_or_none()
                if not last_seen:
                    continue
                is_absent = False
                if mode == "weeks":
                    is_absent = last_seen < cutoff_date
                elif mode == "sessions":
                    if not session_dates:
                        continue
                    last_seen_date = last_seen.date()
                    is_absent = last_seen_date not in session_dates
                else:
                    is_absent = last_seen < cutoff_date

                if not is_absent:
                    continue
                if person.id in open_tasks:
                    stats["messages_skipped"] += 1
                    continue

                task = FollowUpTask(
                    id=uuid.uuid4(),
                    person_id=person.id,
                    rule_id=rule.id,
                    status="open",
                    priority=0,
                    due_at=now + timedelta(days=escalation_days),
                )
                session.add(task)
                open_tasks.add(person.id)
                stats["tasks_created"] += 1

                if not sms_enabled or not template:
                    stats["messages_skipped"] += 1
                    continue
                if person.consent_status != "consented" or not person.phone_enc:
                    stats["messages_skipped"] += 1
                    continue
                context_payload = _default_context(person)
                try:
                    body = _render_template(template, context_payload)
                except ValueError:
                    stats["messages_skipped"] += 1
                    continue
                key_hash = hashlib.sha256(
                    f"{person.id}:{template.id}:{run.id}:sms".encode("utf-8")
                ).hexdigest()
                idempotency_key = f"message_send:auto:{key_hash}"
                request_hash = _hash_message_payload(
                    [str(person.id), str(template.id), "sms", body]
                )
                log_id = _queue_message(
                    session,
                    person=person,
                    template=template,
                    body=body,
                    channel="sms",
                    idempotency_key=idempotency_key,
                    request_hash=request_hash,
                    to_phone_enc=person.phone_enc,
                    to_phone_hash=person.phone_hash,
                )
                if log_id:
                    queued.append((log_id, body))
                    stats["messages_queued"] += 1
                else:
                    stats["messages_skipped"] += 1

            escalation_cutoff = now - timedelta(days=escalation_days)
            escalation_user = _select_escalation_user(session)
            if escalation_user:
                session.execute(
                    update(FollowUpTask)
                    .where(FollowUpTask.status.notin_(["closed", "resolved"]))
                    .where(FollowUpTask.created_at <= escalation_cutoff)
                    .values(assigned_to_user_id=escalation_user)
                )

        else:
            run.status = "failed"
            run.stats_json = {"error": "unsupported rule"}
            session.add(run)
            session.commit()
            record_task_result("tenant-worker", "run_rule_job", "failed")
            return run_id

        run.status = "completed"
        run.stats_json = stats
        session.add(run)
        session.commit()
        record_task_result("tenant-worker", "run_rule_job", "success")
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        had_error = True
        if run:
            run.status = "failed"
            run.stats_json = {"error": str(exc)}
            session.add(run)
            session.commit()
        record_task_result("tenant-worker", "run_rule_job", "error")
        raise
    finally:
        session.close()
        clear_log_context()

    if not had_error:
        for log_id, body in queued:
            send_message_job.delay(tenant_slug, str(log_id), body)
    return run_id


@celery_app.task
def ping() -> str:
    return "pong"
