#!/usr/bin/env bash
# Build a populated six-endings.db for visual audit rounds (see
# scripts/audit-seed-db.ts). Bundle the TS seed script with esbuild —
# Node can't resolve the repo's `@/` alias or the expo-crypto native
# module, so both get remapped: `@/` -> src, `expo-crypto` -> a Node shim.
#
#   scripts/audit-seed-db.sh <output-db-path>
#
# Tooling only: nothing in src/ or the shipped app depends on this.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:?usage: audit-seed-db.sh <output-db-path> [--open]}"
shift || true
BUNDLE="$(mktemp -t audit-seed.XXXXXX.mjs).mjs"

npx esbuild scripts/audit-seed-db.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile="$BUNDLE" \
  --alias:@=./src \
  --alias:expo-crypto=./scripts/audit-expo-crypto-shim.ts

node "$BUNDLE" "$OUT" "$@"
rm -f "$BUNDLE"