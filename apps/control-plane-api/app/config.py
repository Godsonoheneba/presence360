from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "dev"
    database_url: str = ""
    postgres_admin_url: str = ""
    secret_store_backend: str = "env"
    secret_store_path: str = ".secrets/tenant_db.json"
    tenant_db_password_ref: str = "tenant_db_password"
    rekognition_mode: str = "mock"
    rekognition_region: str = "us-east-1"
    internal_token: str = ""
    auth_mode: str = "dev"
    auth_dev_super_token: str = ""
    cors_allow_origins: str = ""
    cors_allow_methods: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    cors_allow_headers: str = "Authorization,Content-Type,Idempotency-Key,X-Request-Id"
    cors_allow_credentials: bool = False
    max_request_size_bytes: int = 5_000_000
    log_level: str = "INFO"
    log_json: bool = True
    metrics_enabled: bool = True
    otel_enabled: bool = False
    otel_service_name: str = "control-plane-api"
    otel_exporter_otlp_endpoint: str = ""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
