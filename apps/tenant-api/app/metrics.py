from __future__ import annotations

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

HTTP_REQUESTS_TOTAL = Counter(
    "presence360_http_requests_total",
    "HTTP requests processed",
    ["service", "method", "path", "status"],
)
HTTP_REQUEST_LATENCY_SECONDS = Histogram(
    "presence360_http_request_latency_seconds",
    "HTTP request latency in seconds",
    ["service", "method", "path"],
)
HTTP_5XX_TOTAL = Counter(
    "presence360_http_5xx_total",
    "HTTP 5xx responses",
    ["service", "method", "path"],
)
MESSAGE_SEND_TOTAL = Counter(
    "presence360_message_send_total",
    "Messages sent/failed",
    ["service", "status"],
)
RECOGNITION_DECISIONS_TOTAL = Counter(
    "presence360_recognition_decisions_total",
    "Recognition decisions",
    ["service", "decision"],
)
CELERY_TASKS_TOTAL = Counter(
    "presence360_celery_tasks_total",
    "Celery task results",
    ["service", "task", "status"],
)


def observe_request(
    service: str,
    method: str,
    path: str,
    status: int,
    duration_seconds: float,
) -> None:
    HTTP_REQUESTS_TOTAL.labels(service, method, path, str(status)).inc()
    HTTP_REQUEST_LATENCY_SECONDS.labels(service, method, path).observe(duration_seconds)
    if status >= 500:
        HTTP_5XX_TOTAL.labels(service, method, path).inc()


def metrics_response() -> Response:
    payload = generate_latest()
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


def record_message_send(service: str, status: str) -> None:
    MESSAGE_SEND_TOTAL.labels(service, status).inc()


def record_recognition_decision(service: str, decision: str) -> None:
    RECOGNITION_DECISIONS_TOTAL.labels(service, decision).inc()


def record_task_result(service: str, task: str, status: str) -> None:
    CELERY_TASKS_TOTAL.labels(service, task, status).inc()
