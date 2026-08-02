#!/usr/bin/env bash
#
# Behavioural test suite for opaque admission credentials (PR 2).
#
# Applies the same stubs as the admission-counter suite, then BOTH check-in
# migrations in order, then the credential assertions and two issuance races.
# Running the counter migration too is deliberate: admission_credentials hangs
# off guest_invitations and tags checkin_scan_events, so the two are only
# meaningful together.
#
#   ./supabase/tests/run-admission-credentials-tests.sh
#
# Uses a local postgres (brew install postgresql@15) when present, and falls
# back to a throwaway Docker container when not.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUBS="$REPO/supabase/tests/00_admission_counters_stubs.sql"
CRED_STUBS="$REPO/supabase/tests/01_admission_credentials_stubs.sql"
COUNTERS="$REPO/supabase/migrations/20260802210000_opuspass_admission_counters.sql"
CREDENTIALS="$REPO/supabase/migrations/20260802220000_opuspass_admission_credentials.sql"
COUNTER_ASSERTIONS="$REPO/supabase/tests/10_admission_counters_test.sql"
ASSERTIONS="$REPO/supabase/tests/20_admission_credentials_test.sql"

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
[[ -x "$PGBIN/psql" ]] || PGBIN="$(dirname "$(command -v psql 2>/dev/null || echo /nonexistent)")"

if [[ -x "$PGBIN/psql" ]]; then
  BACKEND=local
  export PATH="$PGBIN:$PATH"
  export LC_ALL=C LANG=C
  PORT=55435
  SOCK="/tmp/opuspass-cred-pg"
  PGD="$SOCK/data"
  cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
  psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -d cred "$@"; }
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  BACKEND=docker
  CONTAINER=opuspass-cred-pgtest
  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d cred "$@"; }
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
  psql -h "$SOCK" -p "$PORT" -U postgres -q -c "CREATE DATABASE cred;"
else
  cleanup
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cred \
    postgres:16-alpine >/dev/null || { echo "could not start postgres container" >&2; exit 1; }
  for _ in $(seq 1 40); do
    docker exec "$CONTAINER" pg_isready -U postgres -d cred >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U postgres -d cred >/dev/null 2>&1 \
    || { echo "postgres container did not become ready" >&2; exit 1; }
fi

fail=0

for f in "$STUBS" "$CRED_STUBS" "$COUNTERS" "$CREDENTIALS"; do
  [[ -f "$f" ]] || { echo "missing $f" >&2; exit 1; }
  printf -- '── %s\n' "$(basename "$f")"
  psql_run -v ON_ERROR_STOP=1 -q -f - < "$f" 2>&1 | grep -vE 'does not exist, skipping|already exists, skipping'
  if [[ ${PIPESTATUS[0]} -ne 0 ]]; then echo "   MIGRATION FAILED" >&2; exit 1; fi
done

# The admission-counter contract must be unchanged by the credential layer,
# so PR 1's own assertions are re-run here against BOTH migrations.
echo "═══ admission-counter regression ═══"
psql_run -v ON_ERROR_STOP=1 -q -f - < "$COUNTER_ASSERTIONS" 2>&1 \
  | sed -E 's/^psql:[^ ]*: *NOTICE:  //' \
  | grep -E '^FAIL|TESTS PASSED|ERROR'
[[ ${PIPESTATUS[0]} -eq 0 ]] || fail=1

echo "═══ assertions ═══"
psql_run -v ON_ERROR_STOP=1 -q -f - < "$ASSERTIONS" 2>&1 \
  | sed -E 's/^psql:[^ ]*: *NOTICE:  //' \
  | grep -E '^(pass:|FAIL)|TESTS PASSED|ERROR'
[[ ${PIPESTATUS[0]} -eq 0 ]] || fail=1

# ---------------------------------------------------------------------------
# Issuance and rotation under contention. Two renders of the same ticket must
# converge on ONE credential, or a guest ends up holding a QR the door has
# already superseded.
# ---------------------------------------------------------------------------
echo "═══ contention ═══"
RACERS=8
INV='44444444-0000-0000-0000-000000000110'

psql_run -At -q >/dev/null <<SQL
INSERT INTO guest_contacts (id, user_id, full_name)
VALUES ('33333333-0000-0000-0000-000000000110','11111111-1111-1111-1111-111111111111','Race Credential')
ON CONFLICT (id) DO NOTHING;
INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size)
VALUES ('$INV','11111111-1111-1111-1111-111111111111','33333333-0000-0000-0000-000000000110',
        '22222222-2222-2222-2222-222222222222','attending',1)
ON CONFLICT (id) DO NOTHING;
SQL

race() { # $1 label, $2 sql-template using \$i
  local start tmp
  start=$(psql_run -At -c "SELECT (clock_timestamp() + interval '3 seconds')::text")
  tmp=$(mktemp -d)
  for i in $(seq 1 $RACERS); do
    (
      psql_run -At -c "
        SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$start'::timestamptz - clock_timestamp()))));
        $(eval "echo \"$2\"")
      " 2>/dev/null | tail -1 > "$tmp/$i"
    ) &
  done
  wait
  RACE_IDS=$(cat "$tmp"/* | sort -u | grep -c . )
  echo "--- $1"
  echo "    distinct credentials returned: $RACE_IDS"
  rm -rf "$tmp"
}

# Concurrent first renders: exactly one credential may be minted, and every
# caller must be handed that same one.
race "concurrent first-time issuance" \
  "SELECT credential_id FROM ensure_admission_credential('$INV', encode(digest('OP1:race-\$i','sha256'),'hex'), encode(digest('ct-\$i','sha512'),'hex'), 1, 'entrance_pass_render');"
active=$(psql_run -At -c "SELECT count(*) FROM admission_credentials WHERE guest_invitation_id = '$INV' AND status = 'active'")
total=$(psql_run -At -c "SELECT count(*) FROM admission_credentials WHERE guest_invitation_id = '$INV'")
echo "    active: $active, total rows: $total"
[[ "$RACE_IDS" == "1" ]] || { echo "    FAIL: concurrent issuance returned $RACE_IDS different credentials"; fail=1; }
[[ "$active" == "1" ]]   || { echo "    FAIL: expected exactly 1 active credential, got $active"; fail=1; }
[[ "$total" == "1" ]]    || { echo "    FAIL: expected 1 credential row, got $total"; fail=1; }

# Concurrent rotations: each one supersedes the last, but the invariant that
# only one credential is ever active must hold throughout.
race "concurrent rotations" \
  "SELECT credential_id FROM rotate_admission_credential('$INV', encode(digest('OP1:rot-race-\$i','sha256'),'hex'), encode(digest('ct-rot-\$i','sha512'),'hex'), 1, 'race test', 'admin');"
active=$(psql_run -At -c "SELECT count(*) FROM admission_credentials WHERE guest_invitation_id = '$INV' AND status = 'active'")
echo "    active after $RACERS concurrent rotations: $active"
[[ "$active" == "1" ]] || { echo "    FAIL: expected exactly 1 active credential, got $active"; fail=1; }

# And the superseded chain must still be traceable back through every rotation.
orphans=$(psql_run -At -c "SELECT count(*) FROM admission_credentials
                            WHERE guest_invitation_id = '$INV'
                              AND status = 'superseded' AND replaced_by_credential_id IS NULL")
[[ "$orphans" == "0" ]] || { echo "    FAIL: $orphans superseded credentials have no replacement link"; fail=1; }
echo "    superseded credentials without a replacement link: $orphans"

echo "══════════════════"
if [[ $fail -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$fail"
