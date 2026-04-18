#!/usr/bin/env bash
set -euo pipefail
# pre-promote hook shim — invokes the TS implementation via tsx.
# Exit codes propagate: 0 = PASS / PASS-WITH-NOISE, 1 = FAIL, 2 = HUMAN-REVIEW.
exec npx tsx "$(dirname "$0")/pre-promote.ts" "$@"
