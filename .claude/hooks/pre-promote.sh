#!/usr/bin/env bash
set -euo pipefail
exec npx tsx "$(dirname "$0")/pre-promote.ts" "$@"
