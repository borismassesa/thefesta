#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_WORKDIR="$(mktemp -d /tmp/opus-services-025-test.XXXXXX)"
PORT_BASE="${SERVICES_OFFERED_025_TEST_PORT_BASE:-55820}"

cleanup() {
  supabase stop --workdir "$TEST_WORKDIR" --no-backup >/dev/null 2>&1 || true
  case "$TEST_WORKDIR" in
    /tmp/opus-services-025-test.*) rm -rf "$TEST_WORKDIR" ;;
  esac
}
trap cleanup EXIT

supabase init --workdir "$TEST_WORKDIR" --yes >/dev/null
CONFIG="$TEST_WORKDIR/supabase/config.toml"

perl -pi -e \
  "s/54320/${PORT_BASE}/g; s/54321/$((PORT_BASE + 1))/g; s/54322/$((PORT_BASE + 2))/g; s/54323/$((PORT_BASE + 3))/g; s/54324/$((PORT_BASE + 4))/g; s/54327/$((PORT_BASE + 7))/g; s/54329/$((PORT_BASE + 9))/g" \
  "$CONFIG"

supabase start --workdir "$TEST_WORKDIR" >/dev/null
PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$CONFIG")"
DB_CONTAINER="supabase_db_${PROJECT_ID}"

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

run_migration "$REPO_ROOT/supabase/migrations/001_initial_schema.sql"
run_sql "$REPO_ROOT/supabase/tests/services_offered_025_test_support.sql"
run_migration "$REPO_ROOT/supabase/migrations/025_redesign_services_offered.sql"
run_migration "$REPO_ROOT/supabase/migrations/025_redesign_services_offered.sql"
run_sql "$REPO_ROOT/supabase/tests/services_offered_025_integration.sql"

echo "MIGRATION 025 INTEGRATION SUITE PASSED"
