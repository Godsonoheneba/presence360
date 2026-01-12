# Rollback Runbook

Use this runbook after a failed provisioning or a critical regression.

## Control Plane
1) Set tenant `status=error`, `provisioning_state=failed`.
2) Write a `global_audit_logs` entry with the failure reason.
3) Disable tenant access by suspending or removing the tenant record.

## Tenant DB
1) Terminate active connections to the tenant DB.
2) Drop tenant DB and tenant DB role (best-effort).
3) Remove secret reference from secret store (if applicable).

## Rekognition
- Delete the tenant collection if provisioned.

## Verification
- Control-plane /v1/tenants/{id} shows failed state.
- Tenant subdomain is no longer resolvable.
