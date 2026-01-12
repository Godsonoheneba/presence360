from __future__ import annotations

import socket
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock
from typing import Generator
from urllib.parse import quote_plus

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .secret_store import EnvSecretStore, FileSecretStore, SecretStore
from .tenancy import TenantContext, get_tenant_context


@dataclass
class TenantDbConfig:
    host: str
    port: str
    name: str
    user: str
    password: str


class TenantSessionManager:
    def __init__(self, secret_store: SecretStore) -> None:
        self._secret_store = secret_store
        self._engine_cache: dict[str, sessionmaker] = {}
        self._lock = Lock()

    def get_session(self, context: TenantContext) -> Session:
        password = self._secret_store.get(context.secret_ref)
        db_config = TenantDbConfig(
            host=self._normalize_host(context.db_host),
            port=context.db_port,
            name=context.db_name,
            user=context.db_user,
            password=password,
        )
        cache_key = (
            f"{db_config.host}:{db_config.port}:{db_config.name}:"
            f"{db_config.user}:{context.secret_ref}"
        )
        with self._lock:
            session_factory = self._engine_cache.get(cache_key)
            if session_factory is None:
                database_url = self._build_url(db_config)
                engine = create_engine(database_url, future=True)
                session_factory = sessionmaker(
                    bind=engine, class_=Session, expire_on_commit=False
                )
                self._engine_cache[cache_key] = session_factory
        return session_factory()

    def _build_url(self, config: TenantDbConfig) -> str:
        user = quote_plus(config.user)
        password = quote_plus(config.password)
        return (
            f"postgresql+psycopg://{user}:{password}@{config.host}:{config.port}/{config.name}"
        )

    def _normalize_host(self, host: str) -> str:
        settings = get_settings()
        if settings.env != "dev":
            return host
        try:
            socket.gethostbyname(host)
            return host
        except socket.gaierror:
            return "localhost"


def get_secret_store() -> SecretStore:
    settings = get_settings()
    backend = settings.secret_store_backend.lower()
    if backend == "file":
        env_store = EnvSecretStore()
        return FileSecretStore(
            settings.secret_store_path,
            allow_missing_in_dev=settings.env == "dev",
            fallback_env=env_store,
        )
    fallback = None
    if settings.secret_store_path:
        fallback = FileSecretStore(settings.secret_store_path)
    return EnvSecretStore(fallback_store=fallback)


@lru_cache
def get_session_manager() -> TenantSessionManager:
    return TenantSessionManager(secret_store=get_secret_store())


def get_tenant_session(
    tenant: TenantContext = Depends(get_tenant_context),
    manager: TenantSessionManager = Depends(get_session_manager),
) -> Generator[Session, None, None]:
    session = manager.get_session(tenant)
    try:
        yield session
    finally:
        session.close()
