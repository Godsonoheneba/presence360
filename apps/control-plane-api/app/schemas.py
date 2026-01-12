import re

from pydantic import BaseModel, Field, field_validator


class TenantCreateRequest(BaseModel):
    slug: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    admin_email: str

    @field_validator("admin_email")
    @classmethod
    def validate_admin_email(cls, value: str) -> str:
        value = value.strip()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
            raise ValueError("invalid email format")
        return value


class TenantProvisionResponse(BaseModel):
    tenant_id: str
    slug: str
    provisioning_state: str
    db_name: str


class TenantRegistryResponse(BaseModel):
    tenant_id: str
    slug: str
    db_name: str
    db_host: str
    db_port: str
    db_user: str
    secret_ref: str
    tls_mode: str
    status: str
