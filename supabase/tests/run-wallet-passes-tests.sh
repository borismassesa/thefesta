#!/usr/bin/env bash
#
# Behavioural test suite for wallet pass bookkeeping (PR 4).
#
# Applies the stubs and all three check-in migrations in order, then the wallet
# token assertions. The credential migration is needed too: the isolation tests
# assert that a pass link and an admission credential can never resolve as one
# another, which requires both resolvers to exist.
#
#   ./supabase/tests/run-wallet-passes-tests.sh
#
# Uses a local postgres (brew install postgresql@15) when present, and falls
# back to a throwaway Docker container when not.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUBS="$REPO/supabase/tests/00_admission_counters_stubs.sql"
CRED_STUBS="$REPO/supabase/tests/01_admission_credentials_stubs.sql"
WALLET_STUBS="$REPO/supabase/tests/02_wallet_tokens_stubs.sql"
PASS_STUBS="$REPO/supabase/tests/03_wallet_passes_stubs.sql"
COUNTERS="$REPO/supabase/migrations/20260802210000_opuspass_admission_counters.sql"
CREDENTIALS="$REPO/supabase/migrations/20260802220000_opuspass_admission_credentials.sql"
WALLET="$REPO/supabase/migrations/20260802230000_opuspass_wallet_management_tokens.sql"
PASSES="$REPO/supabase/migrations/20260802240000_opuspass_wallet_passes.sql"
ASSERTIONS="$REPO/supabase/tests/40_wallet_passes_test.sql"

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
[[ -x "$PGBIN/psql" ]] || PGBIN="$(dirname "$(command -v psql 2>/dev/null || echo /nonexistent)")"

if [[ -x "$PGBIN/psql" ]]; then
  BACKEND=local
  export PATH="$PGBIN:$PATH"
  export LC_ALL=C LANG=C
  PORT=55437
  SOCK="/tmp/opuspass-passes-pg"
  PGD="$SOCK/data"
  cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
  psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -d passes "$@"; }
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  BACKEND=docker
  CONTAINER=opuspass-passes-pgtest
  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d passes "$@"; }
else
  echo "no postgres available — set PGBIN, brew install postgresql@15, or start Docker" >&2
  exit 1
fi
trap cleanup EXIT

if [[ "$BACKEND" == local ]]; then
  rm -rf "$SOCK"; mkdir -p "$SOCK"
  initdb -D "$PGD" -U postgres --auth=trust >/dev/null 2>&1 || { echo "initdb failed" >&2; exit 1; }
  pg_ctl -D "$PGD" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$SOCK/pg.log" start >/dev/null 2>&1
  for _ in $(seq 1 20); do
    psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
  done
  psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 \
    || { echo "postgres did not start:" >&2; tail -20 "$SOCK/pg.log" >&2; exit 1; }
  psql -h "$SOCK" -p "$PORT" -U postgres -q -c "CREATE DATABASE passes;"
else
  cleanup
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=passes \
    postgres:16-alpine >/dev/null || { echo "could not start postgres container" >&2; exit 1; }
  for _ in $(seq 1 40); do
    docker exec "$CONTAINER" pg_isready -U postgres -d passes >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U postgres -d passes >/dev/null 2>&1 \
    || { echo "postgres container did not become ready" >&2; exit 1; }
fi

fail=0

for f in "$STUBS" "$CRED_STUBS" "$WALLET_STUBS" "$PASS_STUBS" "$COUNTERS" "$CREDENTIALS" "$WALLET" "$PASSES"; do
  [[ -f "$f" ]] || { echo "missing $f" >&2; exit 1; }
  printf -- '── %s\n' "$(basename "$f")"
  psql_run -v ON_ERROR_STOP=1 -q -f - < "$f" 2>&1 | grep -vE 'does not exist, skipping|already exists, skipping'
  if [[ ${PIPESTATUS[0]} -ne 0 ]]; then echo "   MIGRATION FAILED" >&2; exit 1; fi
done

echo "═══ assertions ═══"
psql_run -v ON_ERROR_STOP=1 -q -f - < "$ASSERTIONS" 2>&1 \
  | sed -E 's/^psql:[^ ]*: *NOTICE:  //' \
  | grep -E '^(pass:|FAIL)|TESTS PASSED|ERROR'
[[ ${PIPESTATUS[0]} -eq 0 ]] || fail=1

echo "══════════════════"
if [[ $fail -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$fail"
