#!/usr/bin/env bash
#
# Behavioural test suite for wallet management tokens (PR 3).
#
# Applies the stubs and all three check-in migrations in order, then the wallet
# token assertions. The credential migration is needed too: the isolation tests
# assert that a pass link and an admission credential can never resolve as one
# another, which requires both resolvers to exist.
#
#   ./supabase/tests/run-wallet-tokens-tests.sh
#
# Uses a local postgres (brew install postgresql@15) when present, and falls
# back to a throwaway Docker container when not.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUBS="$REPO/supabase/tests/00_admission_counters_stubs.sql"
CRED_STUBS="$REPO/supabase/tests/01_admission_credentials_stubs.sql"
WALLET_STUBS="$REPO/supabase/tests/02_wallet_tokens_stubs.sql"
COUNTERS="$REPO/supabase/migrations/20260802210000_opuspass_admission_counters.sql"
CREDENTIALS="$REPO/supabase/migrations/20260802220000_opuspass_admission_credentials.sql"
WALLET="$REPO/supabase/migrations/20260802230000_opuspass_wallet_management_tokens.sql"
ASSERTIONS="$REPO/supabase/tests/30_wallet_management_tokens_test.sql"

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
[[ -x "$PGBIN/psql" ]] || PGBIN="$(dirname "$(command -v psql 2>/dev/null || echo /nonexistent)")"

if [[ -x "$PGBIN/psql" ]]; then
  BACKEND=local
  export PATH="$PGBIN:$PATH"
  export LC_ALL=C LANG=C
  PORT=55436
  SOCK="/tmp/opuspass-wallet-pg"
  PGD="$SOCK/data"
  cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
  psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -d wallet "$@"; }
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  BACKEND=docker
  CONTAINER=opuspass-wallet-pgtest
  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d wallet "$@"; }
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
  psql -h "$SOCK" -p "$PORT" -U postgres -q -c "CREATE DATABASE wallet;"
else
  cleanup
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=wallet \
    postgres:16-alpine >/dev/null || { echo "could not start postgres container" >&2; exit 1; }
  for _ in $(seq 1 40); do
    docker exec "$CONTAINER" pg_isready -U postgres -d wallet >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U postgres -d wallet >/dev/null 2>&1 \
    || { echo "postgres container did not become ready" >&2; exit 1; }
fi

fail=0

for f in "$STUBS" "$CRED_STUBS" "$WALLET_STUBS" "$COUNTERS" "$CREDENTIALS" "$WALLET"; do
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

# ---------------------------------------------------------------------------
# Two concurrent sends of the same guest's link must converge on ONE token, or
# the guest ends up holding a URL that a later send has already replaced.
# ---------------------------------------------------------------------------
echo "═══ contention ═══"
RACERS=8
INV='44444444-0000-0000-0000-000000000210'

psql_run -At -q >/dev/null <<SQL
INSERT INTO guest_contacts (id, user_id, full_name)
VALUES ('33333333-0000-0000-0000-000000000210','11111111-1111-1111-1111-111111111111','Race Wallet')
ON CONFLICT (id) DO NOTHING;
INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size)
VALUES ('$INV','11111111-1111-1111-1111-111111111111','33333333-0000-0000-0000-000000000210',
        '22222222-2222-2222-2222-222222222222','attending',1)
ON CONFLICT (id) DO NOTHING;
SQL

start=$(psql_run -At -c "SELECT (clock_timestamp() + interval '3 seconds')::text")
tmp=$(mktemp -d)
for i in $(seq 1 $RACERS); do
  (
    psql_run -At -c "
      SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$start'::timestamptz - clock_timestamp()))));
      SELECT token_id FROM ensure_wallet_management_token('$INV',
        encode(digest('WMT1:race-$i','sha256'),'hex'),
        encode(digest('ct-$i','sha512'),'hex'), 1, 'rsvp_confirmation');
    " 2>/dev/null | tail -1 > "$tmp/$i"
  ) &
done
wait
distinct=$(cat "$tmp"/* | sort -u | grep -c .)
active=$(psql_run -At -c "SELECT count(*) FROM wallet_management_tokens WHERE guest_invitation_id = '$INV' AND status = 'active'")
total=$(psql_run -At -c "SELECT count(*) FROM wallet_management_tokens WHERE guest_invitation_id = '$INV'")
rm -rf "$tmp"
echo "--- concurrent first-time issuance"
echo "    distinct tokens returned: $distinct"
echo "    active: $active, total rows: $total"
[[ "$distinct" == "1" ]] || { echo "    FAIL: concurrent sends returned $distinct different links"; fail=1; }
[[ "$active" == "1" ]]   || { echo "    FAIL: expected exactly 1 active link, got $active"; fail=1; }
[[ "$total" == "1" ]]    || { echo "    FAIL: expected 1 token row, got $total"; fail=1; }

echo "══════════════════"
if [[ $fail -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$fail"
