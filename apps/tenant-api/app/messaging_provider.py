from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from .config import get_settings


@dataclass(frozen=True)
class MessagingResult:
    status: str
    provider_message_id: str | None
    cost_cents: int | None
    error_code: str | None
    raw: dict


class MessagingProvider(Protocol):
    def send_sms(
        self,
        to_phone: str,
        body: str,
        sender_id: str | None,
        client_ref: str | None,
        api_key: str,
    ) -> MessagingResult:
        ...


class MockMessagingProvider:
    def send_sms(
        self,
        to_phone: str,
        body: str,
        sender_id: str | None,
        client_ref: str | None,
        api_key: str,
    ) -> MessagingResult:
        digest = hashlib.sha256(f"{to_phone}:{body}".encode("utf-8")).hexdigest()[:16]
        return MessagingResult(
            status="sent",
            provider_message_id=f"mock-{digest}",
            cost_cents=0,
            error_code=None,
            raw={"status": "sent"},
        )


class MNotifyProvider:
    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
        )

    def send_sms(
        self,
        to_phone: str,
        body: str,
        sender_id: str | None,
        client_ref: str | None,
        api_key: str,
    ) -> MessagingResult:
        payload = {
            "key": api_key,
            "to": to_phone,
            "msg": body,
        }
        if sender_id:
            payload["sender_id"] = sender_id
        if client_ref:
            payload["client_ref"] = client_ref

        attempts = 0
        error_code = None
        raw: dict = {}
        while attempts < 3:
            attempts += 1
            try:
                response = self._client.post("/sms/quick", data=payload)
            except httpx.RequestError:
                error_code = "timeout"
                time.sleep(0.5 * attempts)
                continue
            raw = _sanitize_response(response)
            if response.status_code == 200:
                provider_message_id = str(raw.get("message_id") or raw.get("code") or "")
                return MessagingResult(
                    status="sent",
                    provider_message_id=provider_message_id or None,
                    cost_cents=None,
                    error_code=None,
                    raw=raw,
                )
            if response.status_code in {400, 401, 403}:
                error_code = "rejected"
                break
            if response.status_code == 429 or response.status_code >= 500:
                error_code = "retryable_error"
                time.sleep(0.5 * attempts)
                continue
            error_code = "unknown_error"
            break
        return MessagingResult(
            status="failed",
            provider_message_id=None,
            cost_cents=None,
            error_code=error_code,
            raw=raw,
        )


def _sanitize_response(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except ValueError:
        return {"status_code": response.status_code, "body": response.text}
    redacted = {}
    for key, value in payload.items():
        if key.lower() in {"to", "phone", "msisdn"}:
            continue
        redacted[key] = value
    redacted["status_code"] = response.status_code
    return redacted


def get_messaging_provider() -> MessagingProvider:
    settings = get_settings()
    if settings.messaging_mode == "mnotify":
        return MNotifyProvider(
            base_url=settings.mnotify_base_url,
            timeout_seconds=settings.mnotify_timeout_seconds,
        )
    return MockMessagingProvider()
