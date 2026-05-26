#!/usr/bin/env bash
# Zero-dependency verification harness (no npm, no package.json).
#   1. syntax/parse check every .js (node --check)  ← "typecheck/lint"
#   2. unit tests for pure functions (node --test)   ← "tests"
#   3. RU/EN structural parity (check-sync.py)        ← invariant
# Build = `npx wrangler pages dev` (run manually; not bundled here).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ node --check (functions + client JS)"
while IFS= read -r f; do node --check "$f"; done < <(find functions -name '*.js')
node --check admin-app.js
node --check script.js
echo "  ok"

echo "→ node --test (pure functions)"
node --test tests/*.test.mjs

echo "→ check-sync.py (RU/EN parity)"
python3 scripts/check-sync.py >/dev/null && echo "  ok"

# Bundle Functions the way Pages does — catches cross-module import errors that
# node --check (per-file syntax only) misses. Opt out with NO_BUILD=1 (offline).
if [ "${NO_BUILD:-0}" != "1" ]; then
  echo "→ wrangler pages functions build"
  rm -rf /tmp/fnbuild
  if npx --offline wrangler pages functions build --outdir /tmp/fnbuild >/tmp/fnbuild.log 2>&1; then
    echo "  ok"
  else
    echo "  BUILD FAILED:"; tail -20 /tmp/fnbuild.log; exit 1
  fi
fi

echo "✓ all checks passed"
