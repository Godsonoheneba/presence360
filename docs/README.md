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

## Postman
Import the collections and environment from `postman/`:
- `postman/Presence360-ControlPlane.postman_collection.json`
- `postman/Presence360-TenantAPI.postman_collection.json`
- `postman/Presence360.local.postman_environment.json`

Update the environment tokens to match your `.env` values, then run the requests.

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
