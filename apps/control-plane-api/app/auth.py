from fastapi import Header, HTTPException, status

from .config import get_settings


def get_super_admin(authorization: str | None = Header(default=None)):
    settings = get_settings()
    if settings.auth_mode != "dev":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not settings.auth_dev_super_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured",
        )
    if authorization != f"Bearer {settings.auth_dev_super_token}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return {"role": "super_admin"}


def get_internal_service(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    settings = get_settings()
    if not settings.internal_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal auth not configured",
        )
    if x_internal_token != settings.internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return {"role": "internal"}
