#!/usr/bin/env bash
set -euo pipefail

# Runs a quick pre-push checklist for the monorepo:
# 1) Surfaces nested git repos (often accidental in apps/packages).
# 2) Shows working tree status.
# 3) Runs lint, test, and type-check on changed workspaces since BASE (default origin/main, fallback HEAD~1).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔍 Checking for nested git repos under apps/packages/services..."
NESTED_GIT=$(find apps packages services -name .git -type d -prune 2>/dev/null || true)
if [[ -n "${NESTED_GIT// }" ]]; then
  echo "⚠️  Found nested git directories:"
  echo "${NESTED_GIT}"
else
  echo "✅ No nested git directories detected."
fi

echo
echo "📂 Working tree status (root):"
git status --short
echo

BASE="${BASE_REF:-origin/main}"
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    BASE="HEAD"
  else
    BASE=""
  fi
fi

if [[ -z "$BASE" ]]; then
  echo "🚦 No commits yet; running lint/test/type-check across all workspaces..."
  npx turbo run lint test type-check --filter="."
else
  echo "🚦 Running lint, test, and type-check for changes since ${BASE}..."
  npx turbo run lint test type-check --filter="...[${BASE}]" --filter="."
fi

echo
echo "✅ Pre-push checks finished."
