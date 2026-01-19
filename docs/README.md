# Presence360 Docs

## Local development
```bash
cp .env.example .env
mkdir -p secrets
# Optional: create secrets/dev-secrets.json (gitignored)
make dev-up
make dev-migrate
make dev-seed
make dev-smoke
```

## Frontend env
Add these to `.env` (or use the defaults from `.env.example`):
- `NEXT_PUBLIC_APP_ENV=dev`
- `NEXT_PUBLIC_TENANT_API_BASE_URL=http://localhost:8000`
- `NEXT_PUBLIC_CONTROL_PLANE_API_BASE_URL=http://localhost:8001`
- `NEXT_PUBLIC_DEV_TENANT_SLUG=grace`
- `NEXT_PUBLIC_DEV_AUTH_TOKEN=dev-tenant`
- `NEXT_PUBLIC_DEV_SUPER_TOKEN=dev-super`

## Postman
Import the collections and environment from `postman/`:
- `postman/Presence360-ControlPlane.postman_collection.json`
- `postman/Presence360-TenantAPI.postman_collection.json`
- `postman/Presence360.local.postman_environment.json`

Update the environment tokens to match your `.env` values, then run the requests.

## Screenshots
Add screenshots under `docs/screenshots/`:
- `docs/screenshots/tenant-dashboard.png`
- `docs/screenshots/tenant-onboarding.png`
- `docs/screenshots/control-plane-dashboard.png`

## URLs
- Tenant API: http://localhost:8000
- Control Plane API: http://localhost:8001
- Tenant Web: http://localhost:3000
- Control Plane Web: http://localhost:3001
- Postgres: localhost:5432
- Redis: localhost:6379

## Notes
- Dev secrets live at `secrets/dev-secrets.json` (gitignored).
- `make dev-smoke` exercises tenant provisioning, routing, login, and mock messaging.
- Onboarding wizard lives at `http://localhost:3000/onboarding`.
- Run Playwright smoke tests with `npm run e2e` (requires web apps running).
- Structured logs are written to `logs/dev-tenant-api.jsonl` and `logs/dev-control-plane-api.jsonl` in dev.
  Use `make logs-tail` to stream them.

## Real provider setup (AWS Rekognition + mNotify)
Set these environment variables before starting the APIs:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (or `AWS_DEFAULT_REGION`)
- `TENANT_SECRET_MNOTIFY_API_KEY` (or set `mnotify_api_key` in tenant_config secret ref)
- `PROVIDER_MODE=auto` (default) or `PROVIDER_MODE=live`
- `MESSAGING_MODE=mnotify`

Quick test (replace IDs as needed):
```bash
curl -sS http://localhost:8000/healthz
```

If a provider is not configured, the API returns `503` with
`{"error":"rekognition_not_configured","request_id":"..."}` or
`{"error":"messaging_not_configured","request_id":"..."}`.

### Real smoke test
Place 3+ face images under `scripts/fixtures/real_faces/` (gitignored by default),
then run:
```bash
make real-smoke
```
