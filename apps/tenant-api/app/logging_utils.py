from __future__ import annotations

import contextvars
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

_REQUEST_ID: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
_TENANT_SLUG: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "tenant_slug", default=None
)

_SENSITIVE_KEY = re.compile(r"(authorization|token|secret|password|phone|email)", re.I)
_PHONE_LIKE = re.compile(r"\d{7,}")


def set_log_context(*, request_id: str | None = None, tenant_slug: str | None = None) -> None:
    if request_id is not None:
        _REQUEST_ID.set(request_id)
    if tenant_slug is not None:
        _TENANT_SLUG.set(tenant_slug)


def clear_log_context() -> None:
    _REQUEST_ID.set(None)
    _TENANT_SLUG.set(None)


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        record.request_id = _REQUEST_ID.get()
        record.tenant_slug = _TENANT_SLUG.get()
        return True


class JsonFormatter(logging.Formatter):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self._service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        base: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self._service_name,
            "request_id": getattr(record, "request_id", None),
            "tenant_slug": getattr(record, "tenant_slug", None),
        }
        extra = _extract_extra(record)
        base.update(_redact_dict(extra))
        return json.dumps(base, default=str)


def configure_logging(service_name: str, level: str, json_output: bool) -> None:
    handler = logging.StreamHandler()
    if json_output:
        handler.setFormatter(JsonFormatter(service_name))
    handler.addFilter(ContextFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(logger_name)
        logger.handlers = [handler]
        logger.setLevel(level.upper())
        logger.propagate = False


def _extract_extra(record: logging.LogRecord) -> dict[str, Any]:
    reserved = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "request_id",
        "tenant_slug",
    }
    return {key: value for key, value in record.__dict__.items() if key not in reserved}


def _redact_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: _redact_value(key, value) for key, value in payload.items()}


def _redact_value(key: str, value: Any) -> Any:
    if _SENSITIVE_KEY.search(key):
        return "[REDACTED]"
    if isinstance(value, str) and _PHONE_LIKE.search(value):
        return "[REDACTED]"
    if isinstance(value, dict):
        return _redact_dict(value)
    return value
