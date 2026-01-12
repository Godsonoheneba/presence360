from __future__ import annotations

import logging

from .config import get_settings


def setup_otel(service_name: str) -> None:
    settings = get_settings()
    if not settings.otel_enabled:
        return
    try:
        from opentelemetry import trace  # noqa: F401
    except ImportError:
        logging.getLogger(__name__).warning(
            "otel.enabled_without_dependencies",
            extra={"service": service_name},
        )
        return
    logging.getLogger(__name__).info(
        "otel.enabled_stub",
        extra={
            "service": service_name,
            "endpoint": settings.otel_exporter_otlp_endpoint,
        },
    )
