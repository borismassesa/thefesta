#!/usr/bin/env bash
#
# Behavioural test suite for the Custom Card Commission Service.
#
# Spins up a throwaway Postgres cluster, applies stubs for the handful of
# platform objects the commission migrations depend on (users, wedding_events,
# workforce_employees and the identity helpers), applies the real migrations
# unmodified, then runs the assertions in 10_commission_state_machine_test.sql.
#
# Why a local cluster rather than a Supabase branch: the point of this suite is
# the money model — Gate 1, Gate 2, the ledger arithmetic and the loophole
# register. Those need to be run repeatedly and destructively, which is exactly
# what you never want to do against a shared database.
#
#   ./supabase/tests/run-commission-tests.sh
#
# Requires postgresql@15 (brew install postgresql@15). It does not need to be
# linked or running — this script starts its own cluster on port 55433.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
[[ -x "$PGBIN/psql" ]] || PGBIN="$(dirname "$(command -v psql 2>/dev/null || echo /nonexistent)")"
if [[ ! -x "$PGBIN/psql" ]]; then
  echo "postgres not found — set PGBIN, or: brew install postgresql@15" >&2
  exit 1
fi
export PATH="$PGBIN:$PATH"
# initdb refuses to start a multithreaded postmaster under some macOS locales.
export LC_ALL=C LANG=C

PORT=55433
# Unix socket paths are capped at ~103 bytes, so this cannot live under a long
# scratch directory.
SOCK="/tmp/ccs-pg"
PGD="$SOCK/data"

cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$SOCK"; mkdir -p "$SOCK"
initdb -D "$PGD" -U postgres --auth=trust >/dev/null 2>&1 || { echo "initdb failed" >&2; exit 1; }
pg_ctl -D "$PGD" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$SOCK/pg.log" start >/dev/null 2>&1
for _ in $(seq 1 20); do
  psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done
psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 \
  || { echo "postgres did not start:" >&2; tail -20 "$SOCK/pg.log" >&2; exit 1; }

psql -h "$SOCK" -p "$PORT" -U postgres -q -c "CREATE DATABASE ccs;"

for f in "$REPO/supabase/tests/00_commission_stubs.sql" \
         "$REPO/supabase/migrations/20260730100000_card_commission_core.sql" \
         "$REPO/supabase/migrations/20260730100001_card_commission_production.sql" \
         "$REPO/supabase/migrations/20260730100002_card_commission_state_machine.sql" \
         "$REPO/supabase/migrations/20260730100003_card_commission_brief_seed.sql" \
         "$REPO/supabase/migrations/20260730100004_card_commission_production_pipeline.sql"; do
  [[ -f "$f" ]] || continue
  printf -- '── %s\n' "$(basename "$f")"
  psql -h "$SOCK" -p "$PORT" -U postgres -d ccs -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 \
    | grep -vE 'does not exist, skipping'
  if [[ ${PIPESTATUS[0]} -ne 0 ]]; then echo "   MIGRATION FAILED" >&2; exit 1; fi
done

echo "═══ assertions ═══"
psql -h "$SOCK" -p "$PORT" -U postgres -d ccs -v ON_ERROR_STOP=1 \
     -f "$REPO/supabase/tests/10_commission_state_machine_test.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]*: *NOTICE:  //' \
  | grep -E '^(PASS|FAIL|---)|ALL TESTS PASSED|ERROR'
rc=${PIPESTATUS[0]}
echo "═══════════════════"
if [[ $rc -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$rc"
