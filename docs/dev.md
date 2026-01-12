# Dev Guide

## Start the stack
```bash
cp .env.example .env
make dev-up
```

## Frontend env
Update `.env` with:
- `NEXT_PUBLIC_APP_ENV=dev`
- `NEXT_PUBLIC_TENANT_API_BASE_URL=http://localhost:8000`
- `NEXT_PUBLIC_CONTROL_PLANE_API_BASE_URL=http://localhost:8001`
- `NEXT_PUBLIC_DEV_TENANT_SLUG=grace`
- `NEXT_PUBLIC_DEV_AUTH_TOKEN=dev-tenant`
- `NEXT_PUBLIC_DEV_SUPER_TOKEN=dev-super`

## Install web dependencies (for local lint/test)
```bash
npm --prefix apps/web-tenant install
npm --prefix apps/web-control-plane install
```

## Run migrations
```bash
make dev-migrate
```

## Seed dev data
```bash
make dev-seed
```

## Smoke test
```bash
make dev-smoke
```

## Lint and tests
```bash
make lint
make test
```

## Ports and URLs
- Tenant API: http://localhost:8000
- Control Plane API: http://localhost:8001
- Tenant Web: http://localhost:3000
- Control Plane Web: http://localhost:3001
- Postgres: localhost:5432
- Redis: localhost:6379

## Local secrets
- Dev secrets live at `./secrets/dev-secrets.json` (gitignored).
