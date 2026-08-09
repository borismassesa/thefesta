#!/usr/bin/env bash
#
# Behavioural test suite for the recruitment platform domain.
#
# Unlike the narrower suites in this directory, recruitment cannot be tested
# against a handful of stubs: it hangs off workforce_employees, workforce_jobs
# and the shared audit plumbing, so the only honest fixture is the real schema.
# This runner therefore replays EVERY migration in filename order into a
# throwaway Supabase database and then runs the assertions against it, which
# makes it a clean-migration-chain check as well as a behavioural one.
#
#   ./supabase/tests/run-recruitment-tests.sh
#
# Migrations are applied directly with psql rather than through
# `supabase db reset` so that a failure names the exact migration that broke,
# which matters when the chain is long. `run-clean-migration-chain.sh` remains
# the check that the standard CLI path works; this one is deliberately
# independent of the CLI's version bookkeeping, so a future duplicate version
# would show up as a difference between the two rather than blocking both.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$REPO/supabase/migrations"
# Each file runs in its own rolled-back transaction against the shared replay,
# so they cannot leak fixtures into one another and their order is irrelevant.
ASSERTION_FILES=(
  "$REPO/supabase/tests/50_recruitment_platform_test.sql"
  "$REPO/supabase/tests/51_recruitment_authorization_test.sql"
)
PROJECT="opusfesta-recruitment-test"
WORKDIR="$(mktemp -d /tmp/opus-recruitment-tests.XXXXXX)"
PORT_BASE="${RECRUITMENT_TEST_PORT_BASE:-56320}"

for f in "${ASSERTION_FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing $f" >&2; exit 1; }
done

command -v supabase >/dev/null 2>&1 || { echo "supabase CLI not found" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

cleanup() {
  supabase stop --workdir "$WORKDIR" --no-backup >/dev/null 2>&1 || true
  case "$WORKDIR" in
    /tmp/opus-recruitment-tests.*) rm -rf "$WORKDIR" ;;
  esac
}
trap cleanup EXIT

supabase init --workdir "$WORKDIR" --yes >/dev/null
CONFIG="$WORKDIR/supabase/config.toml"

perl -pi -e \
  "s/^project_id = .*/project_id = \"$PROJECT\"/; s/54320/${PORT_BASE}/g; s/54321/$((PORT_BASE + 1))/g; s/54322/$((PORT_BASE + 2))/g; s/54323/$((PORT_BASE + 3))/g; s/54324/$((PORT_BASE + 4))/g; s/54327/$((PORT_BASE + 7))/g; s/54329/$((PORT_BASE + 9))/g" \
  "$CONFIG"

# Start with no migrations so the CLI hands us a bare Supabase database; the
# chain is then applied deliberately, in order, below.
echo "── starting throwaway database"
supabase start --workdir "$WORKDIR" -x realtime,edge-runtime,vector,imgproxy,supavisor >/dev/null 2>&1 \
  || { echo "could not start local Supabase stack" >&2; exit 1; }

CONTAINER="supabase_db_${PROJECT}"
psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d postgres "$@"; }

echo "── replaying $(ls "$MIGRATIONS" | wc -l | tr -d ' ') migrations"
applied=0
for f in $(ls "$MIGRATIONS" | sort); do
  out=$(psql_run -v ON_ERROR_STOP=1 --single-transaction -q < "$MIGRATIONS/$f" 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "MIGRATION FAILED: $f" >&2
    echo "$out" | grep -E '^(psql:|ERROR|DETAIL|HINT)' | head -10 >&2
    exit 1
  fi
  applied=$((applied + 1))
done
echo "   applied $applied migrations cleanly"

fail=0
for assertions in "${ASSERTION_FILES[@]}"; do
  echo "═══ $(basename "$assertions") ═══"
  # Each file runs inside a transaction that is rolled back afterwards, so the
  # files cannot leak fixtures into one another and their order does not
  # matter. Rolling back is what lets them share one expensive replay.
  { echo 'BEGIN;'; cat "$assertions"; echo 'ROLLBACK;'; } \
    | psql_run -v ON_ERROR_STOP=1 -q 2>&1 \
    | sed -E 's/^(psql:[^ ]*: *)?NOTICE:  //' \
    | grep -E '^(pass:|FAIL)|TESTS PASSED|ERROR'
  [[ ${PIPESTATUS[1]} -eq 0 ]] || fail=1
done

echo "══════════════════"
if [[ $fail -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$fail"
