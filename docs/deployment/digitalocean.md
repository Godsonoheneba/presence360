# DigitalOcean Deployment Architecture

This document describes a production-ready DigitalOcean (DO) deployment for Presence360 Church with a shared Control Plane and Tenant Plane, dedicated tenant databases, and secure edge ingestion.

## 1) High-level topology
- DO Load Balancer terminates TLS and routes to droplets.
- Droplets run Docker containers for API and web tiers.
- DO Managed Postgres hosts the control-plane DB and one DB per tenant initially.
- DO Managed Redis provides queues, rate limiting, and caching.
- Optional DO Spaces stores consented snapshots or exports with TTL.

## 2) Compute layer (Droplets)
Use Docker on droplets with separate services. Early-stage consolidation is allowed.

**Tenant Plane (shared services, per-tenant DBs):**
- tenant-api (FastAPI)
- worker (Celery)
- web-tenant (Next.js)

**Control Plane (shared services):**
- control-plane-api (FastAPI)
- web-control-plane (Next.js)

**Early-stage consolidation options:**
- Combine control-plane-api + web-control-plane on the same droplet.
- Combine web-tenant with tenant-api on the same droplet.

**Notes:**
- Use autoscaling via horizontal droplet replication when load increases.
- Keep worker droplets separate once recognition and messaging volume grows.

## 3) Load balancer
- DO Load Balancer terminates TLS and forwards to droplets over private networking.
- Health checks on tenant-api and control-plane-api endpoints.
- Separate listeners for tenant and control-plane traffic if needed.

## 4) Data layer
**DO Managed Postgres**
- One control-plane DB: `control_plane`.
- One database per tenant in the same cluster initially: `tenant_{uuid}`.
- Dedicated DB user per tenant with least privileges to its DB only.
- Premium path: large tenants get their own managed Postgres cluster.

**DO Managed Redis**
- Single Redis cluster for queues, rate limiting, and caching.
- Tenant isolation via queue prefixes and per-tenant rate limits.

**DO Spaces (optional)**
- Only for consented snapshots or exports.
- Enforce TTL and lifecycle rules; no raw video storage by default.

## 5) DNS plan
Assume base domain `presence360.app`.

- `api.presence360.app` -> Tenant API
- `cp.presence360.app` -> Control Plane API
- `app.presence360.app` -> Tenant web app (optional if served behind `api`)
- `admin.presence360.app` -> Control Plane web
- `*.presence360.app` -> Tenant subdomain routing (e.g., `grace.presence360.app`)

**Local dev subdomain strategy:**
- Use `*.localtest.me` (maps to 127.0.0.1) for tenant subdomains.
- Example: `grace.localtest.me` and `cp.localtest.me`.

**Prod subdomain strategy:**
- Use tenant slugs as subdomains: `tenant_slug.presence360.app`.

## 6) Secrets handling
- Never commit secrets; use `.env.example` placeholders.
- Store runtime secrets in DO environment variables or secured `.env` files on droplets.
- Store tenant DB credentials in a secrets manager or encrypted storage; only reference in control-plane DB.
- Rotate credentials via Control Plane workflows.

## 7) Backup and recovery
**Managed Postgres**
- Enable daily backups + point-in-time recovery.
- Weekly restore drill checklist:
  1) Restore a tenant DB into a new temporary DB.
  2) Run integrity checks and sanity queries.
  3) Validate application connectivity.
  4) Update tenant connection record if recovery is needed.
  5) Document RTO/RPO.

**Managed Redis**
- Backup as supported by DO; treat as ephemeral for queues.

**DO Spaces**
- Enable object versioning and lifecycle policies with TTL.

## 8) Monitoring and alerting
- Health checks on `/healthz` for each API.
- Prometheus metrics for API latency, queue depth, and worker throughput.
- OpenTelemetry traces for request and job flows.
- Alerting on:
  - 5xx rate spikes
  - queue lag
  - Rekognition or mNotify error rates
  - DB connections nearing limits

## 9) Network security
- VPC for private traffic between droplets and managed services.
- Firewalls:
  - Allow only LB -> app ports on droplets.
  - Restrict SSH to admin IPs; disable password auth.
- Enforce TLS for DB connections and internal service calls.

## 10) Staging vs production
- Separate DO projects, VPCs, Postgres clusters, Redis, and Spaces.
- Separate domains: `staging.presence360.app` with wildcard `*.staging.presence360.app`.
- Do not share secrets between environments.

## Ready to deploy checklist
- DNS records created (api, cp, app, admin, wildcard tenant).
- DO Load Balancer provisioned with TLS certs.
- Droplets created with Docker and firewall rules applied.
- Managed Postgres + Redis provisioned; control-plane DB created.
- Tenant DB provisioning automation tested with least-privilege users.
- Secrets injected via env vars; no secrets in repo.
- Health checks, metrics, and alerting configured.
- Backup policies enabled; restore drill validated.
