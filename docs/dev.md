# Dev Guide

## Start the stack
```bash
cp .env.example .env
make up
```

## Install web dependencies (for local lint/test)
```bash
npm --prefix apps/web-tenant install
npm --prefix apps/web-control-plane install
```

## Run migrations
```bash
make migrate-control
make migrate-tenant
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
- Dev tenant DB credentials are stored in `./.secrets/tenant_db.json` (gitignored).
