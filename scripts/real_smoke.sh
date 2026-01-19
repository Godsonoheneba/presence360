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

json_field() {
  local body="$1"
  local field="$2"
  printf '%s' "$body" | JSON_FIELD="$field" python3 -c $'import json, os, sys\nfield=os.environ.get("JSON_FIELD", "")\ntry:\n    data=json.load(sys.stdin)\nexcept json.JSONDecodeError as exc:\n    print(f"INVALID_JSON:{exc}")\n    sys.exit(2)\nif field not in data:\n    print("MISSING_FIELD")\n    sys.exit(3)\nprint(data[field])'
}

extract_request_id() {
  local body="$1"
  printf '%s' "$body" | python3 -c $'import json, sys\ntry:\n    data=json.load(sys.stdin)\nexcept json.JSONDecodeError:\n    print("")\n    sys.exit(0)\nprint(data.get("request_id") or data.get("detail", {}).get("request_id") or "")'
}

curl_with_code() {
  local method="$1"
  local url="$2"
  shift 2
  local output
  if ! output=$(curl -sS --retry 2 --retry-delay 1 --retry-connrefused -w "\n%{http_code}" -X "$method" "$@" "$url"); then
    fail "curl failed ${method} ${url}"
  fi
  RESPONSE_BODY=$(echo "$output" | sed '$d')
  RESPONSE_CODE=$(echo "$output" | tail -n 1)
  if [[ -z "$RESPONSE_CODE" ]]; then
    fail "missing HTTP status for ${method} ${url}: ${RESPONSE_BODY}"
  fi
}

load_env

CONTROL_PLANE_BASE_URL=${CONTROL_PLANE_BASE_URL:-http://localhost:8001}
TENANT_API_BASE_URL=${TENANT_API_BASE_URL:-http://localhost:8000}
AUTH_DEV_SUPER_TOKEN=${AUTH_DEV_SUPER_TOKEN:-dev-super}
AUTH_DEV_TOKEN=${AUTH_DEV_TOKEN:-dev-tenant}
REAL_SMOKE_IMAGES_DIR=${REAL_SMOKE_IMAGES_DIR:-./scripts/fixtures/real_faces}

missing=()
[[ -z "${AWS_ACCESS_KEY_ID:-}" ]] && missing+=("AWS_ACCESS_KEY_ID")
[[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]] && missing+=("AWS_SECRET_ACCESS_KEY")
if [[ -z "${AWS_REGION:-}" && -z "${AWS_DEFAULT_REGION:-}" ]]; then
  missing+=("AWS_REGION")
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  fail "missing AWS env vars: ${missing[*]}"
fi

if [[ ! -d "$REAL_SMOKE_IMAGES_DIR" ]]; then
  fail "missing images directory: ${REAL_SMOKE_IMAGES_DIR}"
fi

mapfile -t images < <(find "$REAL_SMOKE_IMAGES_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | sort)
if [[ ${#images[@]} -lt 3 ]]; then
  fail "need at least 3 images in ${REAL_SMOKE_IMAGES_DIR}"
fi

slug=${REAL_SMOKE_TENANT_SLUG:-real-$(date +%s)}
idempotency_key="real-smoke-${slug}"
create_payload="{\"slug\":\"${slug}\",\"name\":\"Real Smoke Church\",\"template_key\":\"church\",\"admin_email\":\"admin@${slug}.local\",\"admin_name\":\"Real Smoke Admin\",\"timezone\":\"Africa/Accra\",\"locale\":\"en-GH\"}"

curl_with_code POST "${CONTROL_PLANE_BASE_URL}/v1/tenants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_DEV_SUPER_TOKEN}" \
  -H "Idempotency-Key: ${idempotency_key}" \
  -d "${create_payload}"

if [[ "$RESPONSE_CODE" -ge 300 && "$RESPONSE_CODE" -ne 409 ]]; then
  request_id=$(extract_request_id "$RESPONSE_BODY")
  fail "create tenant returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY} ${request_id:+request_id=$request_id}"
fi

curl_with_code POST "${TENANT_API_BASE_URL}/v1/people" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
  -d '{"name":"Real Smoke Person","consent_status":"consented","phone":"+233555000111"}'

if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  request_id=$(extract_request_id "$RESPONSE_BODY")
  fail "create person returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY} ${request_id:+request_id=$request_id}"
fi

person_id=$(json_field "$RESPONSE_BODY" "id") || fail "invalid person response: ${RESPONSE_BODY}"

enroll_args=()
for img in "${images[@]}"; do
  enroll_args+=(-F "images=@${img}")
done

curl_with_code POST "${TENANT_API_BASE_URL}/v1/people/${person_id}/faces" \
  -H "X-Tenant-Slug: ${slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
  "${enroll_args[@]}"

if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  request_id=$(extract_request_id "$RESPONSE_BODY")
  fail "enroll faces returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY} ${request_id:+request_id=$request_id}"
fi

test_image="${images[0]}"
curl_with_code POST "${TENANT_API_BASE_URL}/v1/people/${person_id}/faces/test" \
  -H "X-Tenant-Slug: ${slug}" \
  -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
  -F "image=@${test_image}"

if [[ "$RESPONSE_CODE" -ge 300 ]]; then
  request_id=$(extract_request_id "$RESPONSE_BODY")
  fail "test match returned HTTP ${RESPONSE_CODE}: ${RESPONSE_BODY} ${request_id:+request_id=$request_id}"
fi

decision=$(json_field "$RESPONSE_BODY" "decision") || fail "invalid test match response: ${RESPONSE_BODY}"
if [[ "$decision" != "matched" ]]; then
  fail "expected match, got ${decision}"
fi

echo "PASS: real smoke complete for tenant ${slug}"
