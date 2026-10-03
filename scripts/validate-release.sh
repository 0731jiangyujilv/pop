#!/usr/bin/env bash
# POP October 4 submission release gate. Run from repository root.
# Exits immediately on the first failed check. Does not deploy, broadcast,
# verify, publish, or mutate remote Git state.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail() {
  echo "RELEASE GATE FAILED: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  local local_pnpm="$root/.tools/node_modules/.bin/pnpm"
  if [[ -x "$local_pnpm" ]]; then
    PATH="$(dirname "$local_pnpm"):$PATH"
    export PATH
    command -v pnpm >/dev/null 2>&1 && return
  fi

  if command -v corepack >/dev/null 2>&1; then
    # CI/non-TTY environments cannot always rewrite global bin symlinks.
    if corepack enable >/dev/null 2>&1; then
      corepack prepare pnpm@10.17.1 --activate >/dev/null 2>&1 || true
    fi
    command -v pnpm >/dev/null 2>&1 && return
  fi

  fail "pnpm is required (install via corepack, the pnpm installer, or npm install pnpm@10.17.1 into .tools/)"
}

echo "==> versions"
need git
need forge
need slither
need node
need rg
ensure_pnpm
echo "forge $(forge --version | head -n 1)"
echo "slither $(slither --version)"
echo "node $(node --version)"
echo "pnpm $(pnpm --version)"

echo "==> 1. source secret scan"
"$root/scripts/scan-secrets.sh"

echo "==> 2. git status (informational)"
git status --short

echo "==> 3. forge fmt --check"
( cd "$root/contracts" && forge fmt --check )

echo "==> 4. forge build"
( cd "$root/contracts" && forge build )

echo "==> 5. forge test -vvv"
test_log="$(mktemp)"
( cd "$root/contracts" && forge test -vvv | tee "$test_log" )
rg -q '0 failed; 0 skipped' "$test_log" || fail "default forge test did not report 0 failed / 0 skipped"
rg -q 'EventMarketV2Test' "$test_log" || fail "EventMarketV2 tests were not executed"
rg -q 'RobinhoodDeploymentPreflightTest' "$test_log" || fail "Robinhood preflight tests were not executed"
rg -q 'DeployRobinhoodEventMarketV2Test' "$test_log" || fail "Robinhood deploy-script tests were not executed"

echo "==> 6. focused Slither scan"
"$root/scripts/slither-focused.sh"

echo "==> 7. contract-size / deployment viability"
( cd "$root/contracts" && forge build --sizes | tee /tmp/pop-contract-sizes.txt )
rg -q 'EventMarketV2' /tmp/pop-contract-sizes.txt || fail "EventMarketV2 size row missing"
# Runtime remaining column is the 4th numeric field; 180 bytes was the last measured margin.
rg -q 'EventMarketV2[[:space:]]+\|[[:space:]]+24,' /tmp/pop-contract-sizes.txt || fail "EventMarketV2 size row missing or unexpected"

echo "==> 8. frontend install"
( cd "$root/webapp" && CI=true pnpm install --frozen-lockfile )

echo "==> 9. TypeScript check"
( cd "$root/webapp" && pnpm exec tsc -b --pretty false )

echo "==> 10. Robinhood configuration tests"
( cd "$root/webapp" && pnpm test )

echo "==> 11. active-submission lint"
( cd "$root/webapp" && pnpm run lint:active )

echo "==> 12. production frontend build"
( cd "$root/webapp" && pnpm build )

echo "==> 13. production dependency audit"
( cd "$root/webapp" && pnpm audit --prod )

echo "==> 14. generated-bundle secret scan"
"$root/scripts/scan-secrets.sh" --generated

echo "==> 15. git diff --check"
git diff --check
git diff --cached --check

echo
echo "POP release gate passed."
echo "Default forge test must remain fully green with zero skips."
echo "Legacy tests under contracts/legacy-tests/ are preserved and are not executable."
echo "No deployment, broadcast, verification, publish, or remote Git mutation was performed."
