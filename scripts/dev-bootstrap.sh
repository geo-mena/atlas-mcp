#!/usr/bin/env bash
set -euo pipefail

# Atlas dev bootstrap.
# Brings the local environment to a known-good state so a builder can
# clone → run this script → start working in under 10 minutes.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Atlas dev bootstrap"
echo "    Repo: $ROOT"

# 1. Node version
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v)"
  echo "==> Node version: $NODE_VERSION"
  case "$NODE_VERSION" in
    v20.*) ;;
    *) echo "    WARNING: Node 20.x required. Found $NODE_VERSION. Run 'nvm use' to switch." ;;
  esac
else
  echo "    ERROR: node not found. Install Node 20 (e.g. via nvm)." >&2
  exit 1
fi

# 2. pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  echo "    ERROR: pnpm not found. Install: corepack enable && corepack prepare pnpm@9 --activate" >&2
  exit 1
fi
echo "==> pnpm version: $(pnpm -v)"

# 3. Install workspace deps
echo "==> pnpm install"
pnpm install --frozen-lockfile=false

# 4. Build packages
echo "==> pnpm build"
pnpm build

# 5. Sandbox bootstrap (TODO Day 1)
echo "==> sandbox bootstrap: skipped (TODO wire to apps/sandbox once docker-compose lands)"

# 6. Verification
echo "==> pnpm smoke"
pnpm smoke

echo
echo "==> Bootstrap complete."
echo "    Next: install the plugin into Claude Code:"
echo "      cp -r .claude/ ~/.claude/atlas/"
echo "    Then restart Claude Code and run: /atlas reverse-engineer <target>"
