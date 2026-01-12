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

merge_legacy_secrets() {
  local legacy_file=".secrets/tenant_db.json"
  local target_file="secrets/dev-secrets.json"
  if [[ ! -f "$legacy_file" ]]; then
    return 0
  fi
  if [[ ! -f "$target_file" ]]; then
    mkdir -p "$(dirname "$target_file")"
    echo '{}' > "$target_file"
  fi
  python3 - <<'PY'
import json
from pathlib import Path

legacy = Path('.secrets/tenant_db.json')
target = Path('secrets/dev-secrets.json')

legacy_data = json.loads(legacy.read_text(encoding='utf-8')) if legacy.exists() else {}
target_data = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}

merged = {**legacy_data, **target_data}
merged.update(target_data)

target.write_text(json.dumps(merged, indent=2, sort_keys=True) + '\n', encoding='utf-8')
PY
}

load_env
merge_legacy_secrets

CONTROL_PLANE_BASE_URL=${CONTROL_PLANE_BASE_URL:-http://localhost:8001}
TENANT_API_BASE_URL=${TENANT_API_BASE_URL:-http://localhost:8000}
AUTH_DEV_SUPER_TOKEN=${AUTH_DEV_SUPER_TOKEN:-dev-super}
AUTH_DEV_TOKEN=${AUTH_DEV_TOKEN:-dev-tenant}
CONTROL_PLANE_INTERNAL_TOKEN=${CONTROL_PLANE_INTERNAL_TOKEN:-dev-internal}
DEV_SECRETS_PATH=${DEV_SECRETS_PATH:-secrets/dev-secrets.json}

resolve_tenant() {
  local slug="$1"
  local response
  response=$(curl -sS -w "\n%{http_code}" -X GET "${CONTROL_PLANE_BASE_URL}/v1/tenants/resolve?slug=${slug}" \
    -H "X-Internal-Token: ${CONTROL_PLANE_INTERNAL_TOKEN}")
  local body
  body=$(echo "$response" | sed '$d')
  local code
  code=$(echo "$response" | tail -n 1)
  if [[ "$code" -ge 300 ]]; then
    echo "FAIL resolve tenant ${slug}: HTTP ${code}"
    echo "$body"
    exit 1
  fi
  echo "$body"
}

get_secret_value() {
  local secret_ref="$1"
  python3 - <<PY
import json
from pathlib import Path

secret_ref = "${secret_ref}"
path = Path("${DEV_SECRETS_PATH}")
if not path.exists():
    raise SystemExit("missing secrets file")

value = json.loads(path.read_text(encoding="utf-8")).get(secret_ref)
if value is None:
    raise SystemExit("missing secret ref")

if isinstance(value, dict):
    password = value.get("password") or value.get("value")
elif isinstance(value, str):
    password = value
else:
    password = None

if not password:
    raise SystemExit("missing secret value")

print(password)
PY
}

build_db_url() {
  local db_user="$1"
  local db_password="$2"
  local db_host="$3"
  local db_port="$4"
  local db_name="$5"
  python3 - <<PY
from urllib.parse import quote_plus

user = quote_plus("${db_user}")
password = quote_plus("${db_password}")
host = "${db_host}"
port = "${db_port}"
name = "${db_name}"
print(f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}")
PY
}

needs_bootstrap_stamp() {
  local db_url="$1"
  python3 - <<PY
import psycopg

dsn = "${db_url}".replace("postgresql+psycopg://", "postgresql://")

with psycopg.connect(dsn) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.alembic_version')")
        if cur.fetchone()[0] is None:
            print("0")
            raise SystemExit(0)
        cur.execute("SELECT version_num FROM alembic_version")
        row = cur.fetchone()
        version = row[0] if row else None
        cur.execute("SELECT to_regclass('public.roles')")
        roles = cur.fetchone()[0]
        if version == "0001_init" and roles is not None:
            print("1")
        else:
            print("0")
PY
}

migrate_tenant_db() {
  local slug="$1"
  local tenant_json
  tenant_json=$(resolve_tenant "$slug")
  local db_name
  db_name=$(echo "$tenant_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['db_name'])")
  local db_user
  db_user=$(echo "$tenant_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['db_user'])")
  local db_host
  db_host=$(echo "$tenant_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['db_host'])")
  local db_port
  db_port=$(echo "$tenant_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['db_port'])")
  local secret_ref
  secret_ref=$(echo "$tenant_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['secret_ref'])")

  local password
  password=$(get_secret_value "$secret_ref")
  local db_host_for_container="$db_host"
  if [[ "$db_host_for_container" == "localhost" || "$db_host_for_container" == "127.0.0.1" ]]; then
    db_host_for_container="postgres"
  fi
  local db_url_container
  db_url_container=$(build_db_url "$db_user" "$password" "$db_host_for_container" "$db_port" "$db_name")

  local db_host_for_host="$db_host"
  if [[ "$db_host_for_host" == "postgres" ]]; then
    db_host_for_host="localhost"
  fi
  local db_url_host
  db_url_host=$(build_db_url "$db_user" "$password" "$db_host_for_host" "$db_port" "$db_name")

  local stamp_needed
  stamp_needed=$(needs_bootstrap_stamp "$db_url_host")
  if [[ "$stamp_needed" == "1" ]]; then
    docker compose run --rm -e DATABASE_URL="$db_url_container" tenant-api alembic stamp 0002_bootstrap >/dev/null
  fi
  docker compose run --rm -e DATABASE_URL="$db_url_container" tenant-api alembic upgrade head >/dev/null
  echo "OK tenant ${slug} migrations"
}

create_tenant() {
  local slug="$1"
  local name="$2"
  local admin_email="$3"
  local idempotency_key="seed-${slug}"

  local response
  response=$(curl -sS -w "\n%{http_code}" -X POST "${CONTROL_PLANE_BASE_URL}/v1/tenants" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_DEV_SUPER_TOKEN}" \
    -H "Idempotency-Key: ${idempotency_key}" \
    -d "{\"slug\":\"${slug}\",\"name\":\"${name}\",\"template_key\":\"church\",\"admin_email\":\"${admin_email}\",\"admin_name\":\"${name} Admin\",\"timezone\":\"Africa/Accra\",\"locale\":\"en-GH\"}")

  local body
  body=$(echo "$response" | sed '$d')
  local code
  code=$(echo "$response" | tail -n 1)
  if [[ "$code" -ge 300 ]]; then
    if [[ "$code" == "409" ]] && echo "$body" | grep -qi "slug already exists"; then
      echo "SKIP tenant ${slug} (already exists)"
      return 0
    fi
    echo "FAIL create tenant ${slug}: HTTP ${code}"
    echo "$body"
    exit 1
  fi

  local tenant_id
  tenant_id=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenant_id'])")
  echo "OK tenant ${slug} -> ${tenant_id}"
}

create_template() {
  local slug="$1"
  local name="$2"
  local body_text="$3"

  local response
  response=$(curl -sS -w "\n%{http_code}" -X POST "${TENANT_API_BASE_URL}/v1/templates" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-Slug: ${slug}" \
    -H "Authorization: Bearer ${AUTH_DEV_TOKEN}" \
    -d "{\"name\":\"${name}\",\"channel\":\"sms\",\"body\":\"${body_text}\",\"variables_json\":[\"first_name\"],\"active\":true}")

  local body
  body=$(echo "$response" | sed '$d')
  local code
  code=$(echo "$response" | tail -n 1)
  if [[ "$code" -ge 300 ]]; then
    echo "FAIL create template ${name} for ${slug}: HTTP ${code}"
    echo "$body"
    exit 1
  fi
  echo "OK template ${name} for ${slug}"
}

create_tenant "grace" "Grace Chapel" "admin@grace.local"
create_tenant "joy" "Joy Chapel" "admin@joy.local"

migrate_tenant_db "grace"
migrate_tenant_db "joy"

create_template "grace" "welcome_default" "Welcome to church, {first_name}!"
create_template "grace" "absence_default" "We missed you at church, {first_name}."
create_template "joy" "welcome_default" "Welcome to church, {first_name}!"
create_template "joy" "absence_default" "We missed you at church, {first_name}."

echo "Seed complete."
