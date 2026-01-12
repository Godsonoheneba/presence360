.PHONY: up down logs migrate-control migrate-tenant lint test audit backup-list restore-checklist

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate-control:
	docker compose run --rm control-plane-api alembic upgrade head

migrate-tenant:
	docker compose run --rm tenant-api alembic upgrade head

lint:
	ruff check apps/control-plane-api apps/tenant-api
	npm --prefix apps/web-tenant run lint
	npm --prefix apps/web-control-plane run lint

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

backup-list:
	./scripts/list_do_backups.sh

restore-checklist:
	./scripts/restore_checklist.sh
