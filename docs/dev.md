# Dev Guide

## Start the stack
```bash
cp .env.example .env
make dev-up
```

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
