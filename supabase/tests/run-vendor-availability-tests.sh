#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_WORKDIR="$(mktemp -d /tmp/opus-va-test.XXXXXX)"
PORT_BASE="${VENDOR_AVAILABILITY_TEST_PORT_BASE:-55620}"
FORWARD_MIGRATION="$REPO_ROOT/supabase/migrations/20260802045655_restore_vendor_availability.sql"

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && "${VENDOR_AVAILABILITY_KEEP_FAILED_DB:-0}" == "1" ]]; then
    echo "keeping failed test database at $TEST_WORKDIR for diagnosis" >&2
    return
  fi

  supabase stop --workdir "$TEST_WORKDIR" --no-backup >/dev/null 2>&1 || true
  case "$TEST_WORKDIR" in
    /tmp/opus-va-test.*) rm -rf "$TEST_WORKDIR" ;;
  esac
}
trap cleanup EXIT

supabase init --workdir "$TEST_WORKDIR" --yes >/dev/null
CONFIG="$TEST_WORKDIR/supabase/config.toml"

perl -pi -e \
  "s/54320/${PORT_BASE}/g; s/54321/$((PORT_BASE + 1))/g; s/54322/$((PORT_BASE + 2))/g; s/54323/$((PORT_BASE + 3))/g; s/54324/$((PORT_BASE + 4))/g; s/54327/$((PORT_BASE + 7))/g; s/54329/$((PORT_BASE + 9))/g" \
  "$CONFIG"

run_sql() {
  local file="$1"
  echo "-- $(basename "$file")"
  docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$file"
}

run_migration() {
  local file="$1"
  echo "-- $(basename "$file") [single transaction]"
  docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -f - < "$file"
}

assert_anon_postgrest_denied() {
  local status_env api_url anon_key response_file http_code
  status_env="$(supabase status --workdir "$TEST_WORKDIR" --output env)"
  api_url="$(printf '%s\n' "$status_env" | sed -n 's/^API_URL="\([^"]*\)"/\1/p')"
  anon_key="$(printf '%s\n' "$status_env" | sed -n 's/^ANON_KEY="\([^"]*\)"/\1/p')"
  response_file="$TEST_WORKDIR/anon-rpc-response.json"

  [[ -n "$api_url" && -n "$anon_key" ]] || {
    echo "could not resolve disposable API URL and anon key" >&2
    return 1
  }

  http_code="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --request POST "$api_url/rest/v1/rpc/get_vendor_availability" \
    --header "apikey: $anon_key" \
    --header "Authorization: Bearer $anon_key" \
    --header 'Content-Type: application/json' \
    --data '{"vendor_uuid":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","start_date":"2030-01-01","end_date":"2030-01-02"}')"

  case "$http_code" in
    401|403|404) ;;
    *)
      echo "anonymous PostgREST RPC returned unexpected HTTP $http_code" >&2
      return 1
      ;;
  esac

  docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null
  echo "anonymous PostgREST RPC denied with HTTP $http_code; database remained healthy"
}

supabase start --workdir "$TEST_WORKDIR" >/dev/null
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$CONFIG")"
DB_CONTAINER="supabase_db_${PROJECT_ID}"

run_migration "$REPO_ROOT/supabase/migrations/001_initial_schema.sql"
run_migration "$REPO_ROOT/supabase/migrations/007_vendor_availability.sql"
run_migration "$REPO_ROOT/supabase/migrations/009_vendor_availability.sql"
run_sql "$REPO_ROOT/supabase/tests/vendor_availability_test_support.sql"

echo "== table-exists reconciliation =="
run_migration "$FORWARD_MIGRATION"
run_migration "$FORWARD_MIGRATION"
assert_anon_postgrest_denied
run_sql "$REPO_ROOT/supabase/tests/vendor_availability_integration.sql"

echo "== confirmed-drift reconciliation =="
printf '%s\n' 'DROP TABLE public.vendor_availability;' | \
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1
run_migration "$FORWARD_MIGRATION"
run_sql "$REPO_ROOT/supabase/tests/vendor_availability_integration.sql"

echo "VENDOR AVAILABILITY INTEGRATION SUITE PASSED"
