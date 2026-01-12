from __future__ import annotations

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

HTTP_REQUESTS_TOTAL = Counter(
    "presence360_control_http_requests_total",
    "HTTP requests processed",
    ["service", "method", "path", "status"],
)
HTTP_REQUEST_LATENCY_SECONDS = Histogram(
    "presence360_control_http_request_latency_seconds",
    "HTTP request latency in seconds",
    ["service", "method", "path"],
)
HTTP_5XX_TOTAL = Counter(
    "presence360_control_http_5xx_total",
    "HTTP 5xx responses",
    ["service", "method", "path"],
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
