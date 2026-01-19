.PHONY: up down logs logs-tail migrate-control migrate-tenant lint test audit backup-list restore-checklist dev-up dev-migrate dev-seed dev-smoke real-smoke eslint typecheck e2e restart web-tenant web-control-plane backend-up backend-restart backend-stop api-restart worker-restart web-tenant-stop web-control-plane-stop

up:
	docker compose up -d --build

dev-up: up

backend-up:
	docker compose up -d postgres redis control-plane-api tenant-api worker

backend-restart:
	docker compose restart control-plane-api tenant-api worker

backend-stop:
	docker compose stop control-plane-api tenant-api worker

api-restart:
	docker compose restart control-plane-api tenant-api

worker-restart:
	docker compose restart worker

down:
	docker compose down

restart:
	docker compose down
	docker compose up -d --build

logs:
	docker compose logs -f --tail=100

logs-tail:
	tail -n 200 -f logs/*.jsonl

migrate-control:
	docker compose run --rm control-plane-api alembic upgrade head

migrate-tenant:
	docker compose run --rm tenant-api alembic upgrade head

dev-migrate: migrate-control migrate-tenant

lint:
	ruff check apps/control-plane-api apps/tenant-api
	npm --prefix apps/web-tenant run lint
	npm --prefix apps/web-control-plane run lint

eslint:
	npm --prefix apps/web-tenant run lint
	npm --prefix apps/web-control-plane run lint

typecheck:
	npm --prefix apps/web-tenant run typecheck
	npm --prefix apps/web-control-plane run typecheck

e2e:
	npm run e2e

web-tenant:
	npm --prefix apps/web-tenant run dev

web-control-plane:
	npm --prefix apps/web-control-plane run dev

web-tenant-stop:
	@pid=$$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pid" ]; then \
		kill $$pid && echo "Stopped web-tenant (pid $$pid)"; \
	else \
		echo "web-tenant not running on port 3000"; \
	fi

web-control-plane-stop:
	@pid=$$(lsof -t -iTCP:3001 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pid" ]; then \
		kill $$pid && echo "Stopped web-control-plane (pid $$pid)"; \
	else \
		echo "web-control-plane not running on port 3001"; \
	fi

test:
	PYTHONPATH=apps/control-plane-api pytest apps/control-plane-api/tests
	PYTHONPATH=apps/tenant-api pytest apps/tenant-api/tests
	npm --prefix apps/web-tenant run test
	npm --prefix apps/web-control-plane run test

audit:
	ruff check apps/control-plane-api apps/tenant-api
	PYTHONPATH=apps/control-plane-api pytest apps/control-plane-api/tests
	PYTHONPATH=apps/tenant-api pytest apps/tenant-api/tests
	@command -v pip-audit >/dev/null 2>&1 && pip-audit || echo "pip-audit not installed; skipping"
	@command -v npm >/dev/null 2>&1 && npm --prefix apps/web-tenant audit --audit-level=high || echo "npm audit skipped/failed"
	@command -v npm >/dev/null 2>&1 && npm --prefix apps/web-control-plane audit --audit-level=high || echo "npm audit skipped/failed"

dev-seed:
	./scripts/dev_seed.sh

dev-smoke:
	./scripts/dev_smoke.sh

real-smoke:
	./scripts/real_smoke.sh

backup-list:
	./scripts/list_do_backups.sh

restore-checklist:
	./scripts/restore_checklist.sh
