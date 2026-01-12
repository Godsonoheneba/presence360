from __future__ import annotations

import base64
import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


def normalize_phone(phone: str) -> str:
    cleaned = "".join(char for char in phone.strip() if char.isdigit() or char == "+")
    if not cleaned:
        raise ValueError("phone is invalid")
    return cleaned


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    settings = get_settings()
    key = settings.phone_encryption_key
    if not key or key.upper() == "CHANGE_ME":
        if settings.env == "dev":
            key = base64.urlsafe_b64encode(hashlib.sha256(b"dev").digest()).decode("ascii")
        else:
            raise RuntimeError("PHONE_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode("ascii"))


@lru_cache(maxsize=1)
def _get_hash_secret() -> bytes:
    settings = get_settings()
    secret = settings.phone_hash_secret
    if not secret or secret.upper() == "CHANGE_ME":
        if settings.env == "dev":
            secret = base64.urlsafe_b64encode(hashlib.sha256(b"dev").digest()).decode("ascii")
        else:
            raise RuntimeError("PHONE_HASH_SECRET is not configured")
    return secret.encode("utf-8")


def encrypt_text(value: str) -> str:
    token = _get_fernet().encrypt(value.encode("utf-8"))
    return token.decode("ascii")


def decrypt_text(token: str) -> str:
    try:
        decrypted = _get_fernet().decrypt(token.encode("ascii"))
    except InvalidToken as exc:
        raise ValueError("invalid encryption token") from exc
    return decrypted.decode("utf-8")


def hash_text(value: str) -> str:
    secret = _get_hash_secret()
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()
