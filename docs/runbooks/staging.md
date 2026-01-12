# Staging Plan

## Goals
- Validate migrations and provisioning against a staging Postgres cluster.
- Smoke-test gate ingestion and messaging with mock providers.
- Verify observability (logs + metrics) and backup readiness.

## Environment
- Separate DO project + VPC.
- Separate domains: `staging.presence360.app` and wildcard `*.staging.presence360.app`.
- Isolated Postgres + Redis + optional Spaces.

## Deployment Steps
1) Deploy control-plane and tenant services to staging droplets.
2) Apply migrations.
3) Provision a staging tenant.
4) Run smoke tests:
   - `/healthz`, `/metrics`
   - `/v1/tenants` provisioning
   - `/v1/messages/send` (mock)
   - `/v1/gate/frames` (mock)

## Exit Criteria
- No 5xx in logs during smoke tests.
- Metrics endpoints reachable and emitting data.
- Backup listing + restore drill completed.
