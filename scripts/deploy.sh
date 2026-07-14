#!/usr/bin/env bash
#
# Manual Vercel deploys for the OpusFesta monorepo.
#
#   scripts/deploy.sh <app> [--prod]
#   scripts/deploy.sh all [--prod]
#
#   apps: website | admin | pass | vendors
#
# Without --prod you get a preview deployment with its own URL.
# With --prod the deployment is promoted to the project's production domain.
#
# Each Vercel project has its Root Directory set to apps/<name>, so the CLI must
# run from the repo root and upload the whole workspace -- Vercel applies the
# root directory itself. Project IDs are passed via env vars so the four apps can
# share one repo without fighting over a single .vercel/project.json.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export VERCEL_ORG_ID="team_HxyYm6XmcWABJjO5Od5hjvQX" # OpusFesta team

project_id_for() {
  case "$1" in
    website) echo "prj_28fo5hk9ug9OiAP2jTbqmcE5v8CQ" ;; # opus-festa-website -> www.opusfesta.com
    admin)   echo "prj_gt17XFUvx2wKdYIpy4Sk8WJkmbkS" ;; # opus-admin         -> admin.opusfesta.com
    pass)    echo "prj_gSWlYXkLOBz4uwHzpcl2Ufkf2QZR" ;; # opus-pass
    vendors) echo "prj_QTBQfrGNQoGQIo5anjuSUiWY8qyp" ;; # vendors-portal     -> vendorsportal.opusfesta.com
    *)       return 1 ;;
  esac
}

ALL_APPS="website admin pass vendors"

usage() {
  echo "usage: scripts/deploy.sh <website|admin|pass|vendors|all> [--prod]" >&2
  exit 1
}

[ $# -ge 1 ] || usage

TARGET="$1"
shift

PROD=""
for arg in "$@"; do
  case "$arg" in
    --prod) PROD="--prod" ;;
    *) usage ;;
  esac
done

if [ "$TARGET" = "all" ]; then
  APPS="$ALL_APPS"
else
  project_id_for "$TARGET" >/dev/null || usage
  APPS="$TARGET"
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "Not logged in to Vercel. Run: vercel login" >&2
  exit 1
fi

for app in $APPS; do
  echo ""
  echo "==> Deploying $app${PROD:+ (production)}"
  # --archive=tgz: the monorepo exceeds Vercel's 15k per-deploy file limit, so
  # the source is uploaded as a single tarball instead of file-by-file.
  VERCEL_PROJECT_ID="$(project_id_for "$app")" vercel deploy $PROD --yes --archive=tgz
done
