#!/usr/bin/env bash
# Focused Slither scan for the October 4 submission surface.
# Run from repository root. Fails on unexpected detector categories or counts.
# Accepted findings are triaged in docs/EVENT_MARKET_V2_SECURITY_TRIAGE.md.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/contracts"

if ! command -v slither >/dev/null 2>&1; then
  echo "slither is required for focused security validation" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "rg (ripgrep) is required to assert focused Slither baselines" >&2
  exit 1
fi

fail() {
  echo "FOCUSED SLITHER FAILED: $*" >&2
  exit 1
}

# Assert that a Slither log contains only the expected detector names and
# reports exactly `expected_total` results. Detector names are matched on the
# "Detector: <name>" summary lines Slither prints for each category.
assert_scan() {
  local label="$1"
  local log="$2"
  local expected_total="$3"
  shift 3
  local expected_detectors=("$@")

  local total
  total="$(rg -o '[0-9]+ result\(s\) found' "$log" | head -n 1 | rg -o '^[0-9]+' || true)"
  [[ -n "$total" ]] || fail "$label: could not parse result count"
  [[ "$total" == "$expected_total" ]] || fail "$label: expected $expected_total results, got $total"

  local found
  found="$(rg -o 'Detector: [a-z0-9-]+' "$log" | sed 's/Detector: //' | sort -u | tr '\n' ' ')"
  local expected_sorted
  expected_sorted="$(printf '%s\n' "${expected_detectors[@]}" | sort -u | tr '\n' ' ')"
  [[ "$found" == "$expected_sorted" ]] || fail "$label: unexpected detectors. found=[$found] expected=[$expected_sorted]"

  echo "$label: $total results; detectors OK (${expected_detectors[*]})"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Running focused Slither (EventMarketV2)"
slither src/EventMarketV2.sol --filter-paths 'lib/' >"$tmpdir/v2.txt" 2>&1 || true
assert_scan "EventMarketV2" "$tmpdir/v2.txt" 24 \
  divide-before-multiply uninitialized-local timestamp cyclomatic-complexity

echo "Running focused Slither (RobinhoodDeploymentPreflight)"
slither src/deployment/RobinhoodDeploymentPreflight.sol --filter-paths 'lib/' >"$tmpdir/preflight.txt" 2>&1 || true
assert_scan "RobinhoodDeploymentPreflight" "$tmpdir/preflight.txt" 1 \
  incorrect-equality

echo "Running focused Slither (DeployRobinhoodEventMarketV2)"
slither script/DeployRobinhoodEventMarketV2.s.sol --filter-paths 'lib/' >"$tmpdir/deploy.txt" 2>&1 || true
# The deploy script compiles EventMarketV2 and RobinhoodDeploymentPreflight, so
# it surfaces the union of those accepted detectors (24 V2 + 1 preflight).
assert_scan "DeployRobinhoodEventMarketV2" "$tmpdir/deploy.txt" 25 \
  cyclomatic-complexity divide-before-multiply incorrect-equality timestamp uninitialized-local

echo "Focused Slither baseline matched. See docs/EVENT_MARKET_V2_SECURITY_TRIAGE.md."
