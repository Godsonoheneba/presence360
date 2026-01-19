from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "dev"
    database_url: str = ""
    redis_url: str = ""
    control_plane_api_url: str = ""
    control_plane_internal_token: str = ""
    secret_store_backend: str = "env"
    secret_store_path: str = ".secrets/tenant_db.json"
    tenant_registry_cache_ttl_seconds: int = 30
    provider_mode: str = "auto"
    rekognition_mode: str = "aws"
    rekognition_region: str = "us-east-1"
    mock_face_confidence: float = 99.0
    messaging_mode: str = "mnotify"
    mnotify_base_url: str = "https://api.mnotify.com/api"
    mnotify_timeout_seconds: float = 10.0
    phone_encryption_key: str = ""
    phone_hash_secret: str = ""
    cors_allow_origins: str = ""
    cors_allow_methods: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    cors_allow_headers: str = (
        "Authorization,Content-Type,Idempotency-Key,X-Request-Id,X-Tenant-Slug,X-Gate-Session"
    )
    cors_allow_credentials: bool = False
    max_request_size_bytes: int = 10_000_000
    log_level: str = "INFO"
    log_json: bool = True
    log_to_file: bool = False
    log_file_path: str = ""
    metrics_enabled: bool = True
    metrics_port: int = 9101
    otel_enabled: bool = False
    otel_service_name: str = "tenant-api"
    otel_exporter_otlp_endpoint: str = ""
    gate_bootstrap_token: str = ""
    gate_session_ttl_seconds: int = 3600
    gate_frame_cooldown_seconds: int = 1
    gate_heartbeat_interval_seconds: int = 30
    celery_task_always_eager: bool = False
    celery_task_eager_propagates: bool = True
    auth_mode: str = "dev"
    auth_dev_token: str = ""
    auth_dev_gate_token: str = ""

    model_config = SettingsConfigDict(env_prefix="", case_sensitive=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
