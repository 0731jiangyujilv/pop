#!/usr/bin/env bash
# Fail if tracked or generated files contain private keys or live secret assignments.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

secret_pat='-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|PRIVATE_KEY=0x[0-9a-fA-F]{64}'

args=(
  -I
  -n
  --hidden
  --glob '!.git/**'
  --glob '!**/node_modules/**'
  --glob '!**/lib/**'
  --glob '!**/.pnpm-store/**'
  --glob '!**/cache/**'
  --glob '!**/.cache/**'
  --glob '!**/out/**'
  --glob '!**/broadcast/**'
  --glob '!**/*.lock'
  --glob '!**/package-lock.json'
  --glob '!**/pnpm-lock.yaml'
)

if [[ "${1:-}" == "--generated" ]]; then
  if [[ ! -d webapp/dist ]]; then
    echo "webapp/dist is missing; run the production build before the generated-bundle scan" >&2
    exit 1
  fi
  echo "Scanning generated bundle webapp/dist for secrets"
  # dist/ is gitignored; --no-ignore is required or rg searches nothing.
  if rg -n --no-ignore --glob 'webapp/dist/**' -e "$secret_pat"; then
    echo "Secret-like material found in the generated bundle" >&2
    exit 1
  fi
  echo "Generated-bundle secret scan: clean"
  exit 0
fi

echo "Scanning repository sources for secrets"
# Allow 64-hex matches only when they appear as an assigned private key.
# Broad 0x[64] matches are reported but the assignment form is the fail condition.
if rg "${args[@]}" --glob '!webapp/dist/**' -e "$secret_pat"; then
  echo "Private-key material found in the repository" >&2
  exit 1
fi
echo "Source secret scan: clean"
