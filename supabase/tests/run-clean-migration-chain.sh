#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHAIN_WORKDIR="$(mktemp -d /tmp/opus-migration-chain.XXXXXX)"
PORT_BASE="${MIGRATION_CHAIN_TEST_PORT_BASE:-55720}"

cleanup() {
  supabase stop --workdir "$CHAIN_WORKDIR" --no-backup >/dev/null 2>&1 || true
  case "$CHAIN_WORKDIR" in
    /tmp/opus-migration-chain.*) rm -rf "$CHAIN_WORKDIR" ;;
  esac
}
trap cleanup EXIT

supabase init --workdir "$CHAIN_WORKDIR" --yes >/dev/null
CONFIG="$CHAIN_WORKDIR/supabase/config.toml"

perl -pi -e \
  "s/54320/${PORT_BASE}/g; s/54321/$((PORT_BASE + 1))/g; s/54322/$((PORT_BASE + 2))/g; s/54323/$((PORT_BASE + 3))/g; s/54324/$((PORT_BASE + 4))/g; s/54327/$((PORT_BASE + 7))/g; s/54329/$((PORT_BASE + 9))/g" \
  "$CONFIG"

if [[ -d "$CHAIN_WORKDIR/supabase/migrations" ]]; then
  rmdir "$CHAIN_WORKDIR/supabase/migrations"
fi
ln -s "$REPO_ROOT/supabase/migrations" "$CHAIN_WORKDIR/supabase/migrations"

supabase db start --workdir "$CHAIN_WORKDIR"
supabase db reset --local --no-seed --workdir "$CHAIN_WORKDIR"

echo "CLEAN MIGRATION CHAIN PASSED"
