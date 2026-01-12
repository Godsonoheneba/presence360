# Provisioning Runbook

Use this runbook to provision a tenant and validate all control-plane steps.

## Preconditions
- Control-plane API is healthy (`/healthz`).
- Postgres admin credentials available.
- Secret store backend configured (`SECRET_STORE_BACKEND` + `SECRET_STORE_PATH` or env secrets).
- Rekognition provider configured (mock ok in dev).

## Steps
1) Create tenant:
   - `POST /v1/tenants` with slug, name, admin_email.
2) Validate control-plane DB:
   - Tenant row exists and `provisioning_state=ready`.
   - `tenant_db_connections` contains db_name/db_user/secret_ref.
3) Validate tenant DB:
   - DB exists and role exists.
   - `alembic_version` is `head`.
   - admin user seeded in `users`.
4) Validate Rekognition:
   - Collection exists for tenant_id.

## Rollback (if failed)
- Mark tenant as failed (`provisioning_state=failed`).
- Drop tenant DB and role (best-effort).
- Remove tenant connection and audit log entries.

## Notes
- In dev with `SECRET_STORE_BACKEND=env`, tenant DB password comes from
  `TENANT_SECRET_TENANT_DB_PASSWORD`.
