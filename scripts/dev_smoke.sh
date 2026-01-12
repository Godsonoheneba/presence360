#!/usr/bin/env bash
set -euo pipefail

load_env() {
  local env_file="${ENV_FILE:-.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    . "$env_file"
    set +a
  fi
}

fail() {
  echo "FAIL: $1"
  exit 1
}

curl_with_code() {
  local method="$1"
  local url="$2"
  shift 2
  local output
  if ! output=$(curl -sS --retry 3 --retry-delay 1 --retry-connrefused -w "\n%{http_code}" -X "$method" "$@" "$url"); then
    fail "curl failed ${method} ${url}"
  fi
  RESPONSE_BODY=$(echo "$output" | sed '$d')
  RESPONSE_CODE=$(echo "$output" | tail -n 1)
  if [[ -z "$RESPONSE_CODE" ]]; then
    fail "missing HTTP status for ${method} ${url}: ${RESPONSE_BODY}"
  fi
}

wait_for() {
  local url="$1"
  for _ in {1..20}; do
    if curl -sS "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  fail "service not ready: ${url}"
}

json_field() {
  local body="$1"
  local field="$2"
  printf '%s' "$body" | JSON_FIELD="$field" python3 -c $'import json, os, sys\nfield=os.environ.get("JSON_FIELD", "")\ntry:\n    data=json.load(sys.stdin)\nexcept json.JSONDecodeError as exc:\n    print(f"INVALID_JSON:{exc}")\n    sys.exit(2)\nif field not in data:\n    print("MISSING_FIELD")\n    sys.exit(3)\nprint(data[field])'
}

extract_status() {
  local body="$1"
  local target_id="$2"
  printf '%s' "$body" | TARGET_ID="$target_id" python3 -c $'import json, os, sys\ntry:\n    data=json.load(sys.stdin)\nexcept json.JSONDecodeError:\n    print("")\n    sys.exit(0)\ntarget=os.environ.get("TARGET_ID")\nstatus=""\nfor item in data.get("items", []):\n    if item.get("id") == target:\n        status=item.get("status") or ""\n        break\nprint(status)'
}

load_env

CONTROL_PLANE_BASE_URL=${CONTROL_PLANE_BASE_URL:-http://localhost:8001}
TENANT_API_BASE_URL=${TENANT_API_BASE_URL:-http://localhost:8000}
AUTH_DEV_SUPER_TOKEN=${AUTH_DEV_SUPER_TOKEN:-dev-super}
AUTH_DEV_TOKEN=${AUTH_DEV_TOKEN:-dev-tenant}

wait_for "${CONTROL_PLANE_BASE_URL}/healthz"
wait_for "${TENANT_API_BASE_URL}/healthz"

smoke_slug="smoke-$(date +%s)"
idempotency_key="smoke-${smoke_slug}"

create_payload="{\"slug\":\"${smoke_slug}\",\"name\":\"Smoke Test Church\",\"template_key\":\"church\",\"admin_email\":\"admin@${smoke_slug}.local\",\"admin_name\":\"Smoke Admin\",\"timezone\":\"Africa/Accra\",\"locale\":\"en-GH\"}"

curl_with_code POST "${CONTROL_PLANE_BASE_URL}/v1/tenants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_DEV_SUPER_TOKEN}" \
  -H "Idempotency-Key: ${idempotency_key}" \
  -d "${create_payload}"
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "create tenant returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi

tenant_id=$(json_field "$RESPONSE_BODY" "tenant_id") || fail "invalid create tenant response: ${RESPONSE_BODY}"
db_name=$(json_field "$RESPONSE_BODY" "db_name") || fail "invalid create tenant response: ${RESPONSE_BODY}"

curl_with_code POST "${CONTROL_PLANE_BASE_URL}/v1/tenants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_DEV_SUPER_TOKEN}" \
  -H "Idempotency-Key: ${idempotency_key}" \
  -d "${create_payload}"
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "idempotent create tenant returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi
repeat_id=$(json_field "$RESPONSE_BODY" "tenant_id") || fail "invalid create tenant response: ${RESPONSE_BODY}"
if [[ "$repeat_id" != "$tenant_id" ]]; then
  fail "idempotency mismatch: ${tenant_id} != ${repeat_id}"
fi

curl_with_code GET "${TENANT_API_BASE_URL}/v1/tenant-info" \
  -H "X-Tenant-Slug: ${smoke_slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}"
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "tenant-info returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi
info_db=$(json_field "$RESPONSE_BODY" "db_name") || fail "invalid tenant-info response: ${RESPONSE_BODY}"
if [[ "$info_db" != "$db_name" ]]; then
  fail "tenant-info db_name mismatch: ${db_name} != ${info_db}"
fi

curl_with_code POST "${TENANT_API_BASE_URL}/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${smoke_slug}" \
  -d '{"email":"smoke@example.com","password":"password"}'
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "login returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi

curl_with_code GET "${TENANT_API_BASE_URL}/v1/me" \
  -H "X-Tenant-Slug: ${smoke_slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}"
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "me returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi

template_name="smoke_template_${smoke_slug}"
template_body="Welcome to church, {first_name}!"

curl_with_code POST "${TENANT_API_BASE_URL}/v1/templates" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${smoke_slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
  -d "{\"name\":\"${template_name}\",\"channel\":\"sms\",\"body\":\"${template_body}\",\"variables_json\":[\"first_name\"],\"active\":true}"
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "create template returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi

curl_with_code POST "${TENANT_API_BASE_URL}/v1/messages/send" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${smoke_slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
  -H "Idempotency-Key: smoke-msg-${smoke_slug}" \
  -d '{"to_phone":"+233000000000","body":"Smoke test message"}'
if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  fail "send message returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY}"
fi
message_log_id=$(json_field "$RESPONSE_BODY" "message_log_id") || fail "invalid send message response: ${RESPONSE_BODY}"

status=""
for _ in {1..10}; do
  curl_with_code GET "${TENANT_API_BASE_URL}/v1/messages/logs?limit=20" \
    -H "X-Tenant-Slug: ${smoke_slug}" \
    -H "Authorization: Bearer ${AUTH_DEV_TOKEN}"
  status=$(extract_status "$RESPONSE_BODY" "$message_log_id")
  if [[ "$status" == "sent" ]]; then
    echo "PASS: message sent"
    echo "PASS: dev smoke complete"
    exit 0
  fi
  if [[ "$status" == "failed" ]]; then
    fail "message failed"
  fi
  sleep 1

done

fail "message did not reach sent state"
