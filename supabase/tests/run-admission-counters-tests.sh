#!/usr/bin/env bash
#
# Behavioural test suite for the OpusPass admission counter.
#
# Spins up a throwaway Postgres, applies stubs for the handful of platform
# objects the check-in migration depends on (users, wedding_events,
# guest_contacts, guest_invitations), applies the real migration unmodified,
# then runs the assertions in 10_admission_counters_test.sql and a set of
# concurrency races.
#
# Why a local cluster rather than a Supabase branch: this suite is about what
# happens when two doors scan the same pass at the same instant, and when an
# administrative edit collides with an admission. Those need to be run
# repeatedly and destructively, which is exactly what you never want to do
# against a shared database.
#
#   ./supabase/tests/run-admission-counters-tests.sh
#
# Uses a local postgres (brew install postgresql@15) when one is present, the
# same way run-commission-tests.sh does. Falls back to a throwaway Docker
# container when it is not, so the suite runs on a machine with either.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260802210000_opuspass_admission_counters.sql"
STUBS="$REPO/supabase/tests/00_admission_counters_stubs.sql"
ASSERTIONS="$REPO/supabase/tests/10_admission_counters_test.sql"

EVENT='22222222-2222-2222-2222-222222222222'
RACERS=8

# --- backend selection -------------------------------------------------------
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
[[ -x "$PGBIN/psql" ]] || PGBIN="$(dirname "$(command -v psql 2>/dev/null || echo /nonexistent)")"

if [[ -x "$PGBIN/psql" ]]; then
  BACKEND=local
  export PATH="$PGBIN:$PATH"
  export LC_ALL=C LANG=C
  PORT=55434
  SOCK="/tmp/opuspass-adm-pg"   # socket paths are capped at ~103 bytes
  PGD="$SOCK/data"
  cleanup() { pg_ctl -D "$PGD" stop -m immediate >/dev/null 2>&1 || true; }
  psql_run() { psql -h "$SOCK" -p "$PORT" -U postgres -d adm "$@"; }
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  BACKEND=docker
  CONTAINER=opuspass-adm-pgtest
  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d adm "$@"; }
else
  echo "no postgres available — set PGBIN, brew install postgresql@15, or start Docker" >&2
  exit 1
fi
trap cleanup EXIT

start_backend() {
  if [[ "$BACKEND" == local ]]; then
    rm -rf "$SOCK"; mkdir -p "$SOCK"
    initdb -D "$PGD" -U postgres --auth=trust >/dev/null 2>&1 \
      || { echo "initdb failed" >&2; exit 1; }
    pg_ctl -D "$PGD" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$SOCK/pg.log" start >/dev/null 2>&1
    for _ in $(seq 1 20); do
      psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
      sleep 0.5
    done
    psql -h "$SOCK" -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 \
      || { echo "postgres did not start:" >&2; tail -20 "$SOCK/pg.log" >&2; exit 1; }
    psql -h "$SOCK" -p "$PORT" -U postgres -q -c "CREATE DATABASE adm;"
  else
    cleanup
    docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=adm \
      postgres:16-alpine >/dev/null || { echo "could not start postgres container" >&2; exit 1; }
    for _ in $(seq 1 40); do
      docker exec "$CONTAINER" pg_isready -U postgres -d adm >/dev/null 2>&1 && break
      sleep 1
    done
    docker exec "$CONTAINER" pg_isready -U postgres -d adm >/dev/null 2>&1 \
      || { echo "postgres container did not become ready" >&2; exit 1; }
  fi
}

# Reset a fixture row. Lowering checked_in_count is refused outside
# amend_guest_invitation_checkin(), so the reset takes the same
# transaction-local authorisation that RPC sets. One -c is one transaction.
reset_row() { # $1 invitation, $2 allowance
  psql_run -At -c "
    DELETE FROM checkin_scan_events WHERE guest_invitation_id = '$1';
    SELECT set_config('opuspass.checkin_amend', 'on', true);
    UPDATE guest_invitations
       SET checked_in_count = 0, checked_in_at = NULL, checked_in_by = NULL,
           checked_in_door = NULL, checked_in_party_size = NULL,
           entry_allowance = $2, rsvp_status = 'attending'
     WHERE id = '$1';" >/dev/null 2>&1
  local n
  n=$(psql_run -At -c "SELECT checked_in_count FROM guest_invitations WHERE id = '$1'")
  [[ "$n" == "0" ]] || { echo "    FAIL: fixture reset did not take (count=$n)"; return 1; }
}

fail=0

start_backend

for f in "$STUBS" "$MIGRATION"; do
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
# Contention. Every racer parks on a shared wall-clock instant so they hit the
# same row together rather than politely queueing behind each other.
# ---------------------------------------------------------------------------
echo "═══ contention ═══"

run_race() { # $1 label, $2 invitation, $3 allowance, $4 admit arg, $5 shared|unique
  reset_row "$2" "$3" || { fail=1; return; }

  local start tmp
  start=$(psql_run -At -c "SELECT (clock_timestamp() + interval '3 seconds')::text")
  tmp=$(mktemp -d)

  local i req
  for i in $(seq 1 $RACERS); do
    if [[ "$5" == shared ]]; then req="'00000000-dead-beef-0000-000000000001'"; else req="gen_random_uuid()"; fi
    (
      psql_run -At -c "
        SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$start'::timestamptz - clock_timestamp()))));
        SELECT result FROM checkin_admit_guest(
          '$2', '$EVENT', $4, 'Racer $i', 'Gate $i', $req);
      " 2>/dev/null | tail -1 > "$tmp/$i"
    ) &
  done
  wait

  RACE_ADMITTED=$(cat "$tmp"/* | grep -c '^admitted$')
  RACE_FINAL=$(psql_run -At -c "SELECT checked_in_count FROM guest_invitations WHERE id = '$2'")
  echo "--- $1"
  echo "    outcomes:    $(cat "$tmp"/* | sort | uniq -c | tr '\n' ' ' | tr -s ' ')"
  echo "    final count: $RACE_FINAL / $3"
  rm -rf "$tmp"
}

expect() { # $1 actual, $2 expected, $3 message
  [[ "$1" == "$2" ]] || { echo "    FAIL: $3 (got $1, expected $2)"; fail=1; }
}

# A: every device scans the last remaining seat. Exactly one may win.
run_race "A: $RACERS racers, allowance 1" '44444444-0000-0000-0000-000000000010' 1 'NULL' unique
expect "$RACE_ADMITTED" 1 "expected exactly one winner"
expect "$RACE_FINAL"    1 "final count must be 1"

# B: allowance 4, one seat each. Exactly four may win, no overshoot.
run_race "B: $RACERS racers, allowance 4, 1 seat each" '44444444-0000-0000-0000-000000000012' 4 '1' unique
expect "$RACE_ADMITTED" 4 "expected exactly four winners"
expect "$RACE_FINAL"    4 "final count must be 4"

# C: one request id delivered many times at once. The counter moves once.
psql_run -At -c "DELETE FROM checkin_scan_events
                  WHERE request_id = '00000000-dead-beef-0000-000000000001';" >/dev/null 2>&1
run_race "C: $RACERS deliveries of ONE request id" '44444444-0000-0000-0000-000000000012' 4 '2' shared
expect "$RACE_FINAL" 2 "a retry storm must admit exactly one party"

# ---------------------------------------------------------------------------
# An admission contending with an administrative edit. Both lock acquisition
# orders are forced by holding one transaction open across the other's arrival.
# Invariant throughout: 0 <= checked_in_count <= entry_allowance.
# ---------------------------------------------------------------------------
INV='44444444-0000-0000-0000-000000000010'

setup_seeded() { # $1 allowance, $2 already admitted, $3 rsvp_status
  reset_row "$INV" "$1" || { fail=1; return 1; }
  if [[ "$2" -gt 0 ]]; then
    psql_run -At -c "SELECT checkin_admit_guest('$INV','$EVENT',$2,'Setup','Setup',gen_random_uuid());" >/dev/null
  fi
  psql_run -At -c "UPDATE guest_invitations SET rsvp_status = '$3' WHERE id = '$INV';" >/dev/null
}

hold_then() { # $1 = SQL held open for 1.5s inside a transaction
  psql_run -At >/dev/null 2>&1 <<SQL &
BEGIN;
$1
SELECT pg_sleep(1.5);
COMMIT;
SQL
  sleep 0.4
}

check_invariant() { # $1 label
  local bad state
  bad=$(psql_run -At -c "SELECT count(*) FROM guest_invitations WHERE id = '$INV'
                           AND NOT (checked_in_count BETWEEN 0 AND entry_allowance)")
  state=$(psql_run -At -c "SELECT checked_in_count || '/' || entry_allowance || ' ' || rsvp_status
                             FROM guest_invitations WHERE id = '$INV'")
  echo "    final state: $state"
  [[ "$bad" == "0" ]] || { echo "    FAIL: $1 broke 0 <= count <= allowance"; fail=1; }
}

echo "--- D1: admission commits first, allowance cut arrives second"
setup_seeded 4 3 attending
hold_then "SELECT result FROM checkin_admit_guest('$INV','$EVENT',1,'Racer A','Gate A',gen_random_uuid());"
cut=$(psql_run -At -c "UPDATE guest_invitations SET entry_allowance = 3 WHERE id = '$INV';" 2>&1 | tr '\n' ' ')
wait
case "$cut" in
  *"below the 4 already admitted"*) echo "    allowance cut refused with a domain error" ;;
  *) echo "    FAIL: D1 expected the cut to be refused, got: $cut"; fail=1 ;;
esac
check_invariant D1

echo "--- D2: allowance cut commits first, admission arrives second"
setup_seeded 4 3 attending
hold_then "UPDATE guest_invitations SET entry_allowance = 3 WHERE id = '$INV';"
out=$(psql_run -At -c "SELECT result FROM checkin_admit_guest('$INV','$EVENT',1,'Racer B','Gate B',gen_random_uuid());" 2>&1 | tail -1)
wait
echo "    admission:   $out"
expect "$out" exhausted "D2 admission should find no seats left"
check_invariant D2

echo "--- E1: decline commits first, admission arrives second"
setup_seeded 2 0 attending
hold_then "UPDATE guest_invitations SET rsvp_status = 'declined' WHERE id = '$INV';"
out=$(psql_run -At -c "SELECT result FROM checkin_admit_guest('$INV','$EVENT',NULL,'Racer C','Gate C',gen_random_uuid());" 2>&1 | tail -1)
wait
echo "    admission:   $out"
expect "$out" not_attending "E1 must never admit after a decline has won"
expect "$(psql_run -At -c "SELECT checked_in_count FROM guest_invitations WHERE id = '$INV'")" 0 \
       "E1 counter must not move"
check_invariant E1

echo "--- E2: admission commits first, decline arrives second"
setup_seeded 2 0 attending
hold_then "SELECT result FROM checkin_admit_guest('$INV','$EVENT',NULL,'Racer D','Gate D',gen_random_uuid());"
psql_run -At -c "UPDATE guest_invitations SET rsvp_status = 'declined' WHERE id = '$INV';" >/dev/null 2>&1
wait
# The admission won, so it stands: the guest is physically inside. The decline
# is recorded after the fact, and the ledger still explains who let them in.
expect "$(psql_run -At -c "SELECT checked_in_count FROM guest_invitations WHERE id = '$INV'")" 2 \
       "E2 a committed admission must stand"
check_invariant E2

echo "══════════════════"
if [[ $fail -eq 0 ]]; then echo "SUITE PASSED"; else echo "SUITE FAILED"; fi
exit "$fail"
