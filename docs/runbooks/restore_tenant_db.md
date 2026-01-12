# Restore Tenant DB Drill

Use this checklist to validate backups and recovery procedures.

## Checklist
1) Identify tenant DB name from control-plane (`tenant_db_connections`).
2) Restore tenant DB into a temporary database in Postgres.
3) Run integrity checks:
   - `SELECT COUNT(*) FROM users;`
   - `SELECT COUNT(*) FROM visit_events;`
4) Validate app connectivity using the restored DB.
5) If promoting restore:
   - Update `tenant_db_connections` to point to restored DB.
   - Rotate tenant DB credentials and update secret store.
6) Record drill results (RTO/RPO, errors, actions).

## DO Managed Postgres
- Use `doctl databases backups list <cluster-id>` to list backups.
- Use point-in-time recovery for targeted restores.
