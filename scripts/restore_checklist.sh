#!/usr/bin/env bash
set -euo pipefail

cat <<'CHECKLIST'
Restore Verification Checklist:
1) Restore tenant DB to a temporary database.
2) Verify schema: alembic_version at head.
3) Sanity queries:
   - SELECT COUNT(*) FROM users;
   - SELECT COUNT(*) FROM visit_events;
4) App connectivity test against restored DB.
5) Rotate DB credentials and update secret_ref.
6) Update control-plane tenant_db_connections if promoting restore.
7) Record RTO/RPO and outcomes.
CHECKLIST
