---
name: atlas
description: Reverse-engineer a legacy target into deployable OpenAPI + MCP + fidelity-test artifacts. Dispatches four discovery subagents in parallel, synthesizes their findings, generates artifacts, and gates promotion on the Fidelity Auditor.
allowed-tools:
  - mcp__atlas-scratchpad__*
  - mcp__atlas-synthesizer__*
  - mcp__atlas-fidelity-auditor__*
  - mcp__atlas-traffic-sniffer__*
  - Agent
  - Read
  - Write
  - Bash
---

# /atlas — Atlas orchestrator skill

> Skeleton. Day 0 placeholder. Discovery loop and dispatch contract refined Day 4 of the build plan.

## Invocation

```
/atlas reverse-engineer <target> [--scope <hint>] [--output <dir>]
```

- `<target>` — URL of a running legacy UI, or filesystem path to a legacy codebase
- `--scope` — optional natural-language hint to narrow exploration (e.g. "invoice issuance only")
- `--output` — optional output directory; defaults to `.atlas/runs/<run-id>/`

## Run directory convention

```
.atlas/runs/<run-id>/
├── scratchpad.sqlite          # facts written by source agents (via mcp-scratchpad)
├── transcripts/               # per-subagent transcripts captured by Claude Code
├── artifacts/
│   ├── openapi.yaml
│   ├── mcp-server/            # generated TS MCP scaffold
│   └── tests/                 # generated vitest + nock cassettes
└── audit/
    ├── results.jsonl
    ├── coverage.md
    ├── failed/
    └── report.md
```

## Dispatch loop (intended behavior — TBD implementation Day 4)

1. Parse arguments, generate `run-id`, create the run directory.
2. Dispatch the four source-agent subagents IN PARALLEL via the `Agent` tool with budget guidance:

   | Subagent | Token target | Wall-clock | Tool-call cap |
   | --- | --- | --- | --- |
   | code-spelunker | 200K | 30 min | 500 |
   | ui-explorer | 400K | 45 min | 200 |
   | traffic-sniffer | 100K | 30 min | n/a |
   | doc-harvester | 150K | 20 min | 100 |

3. Wait for all four to return. Verify scratchpad fact counts meet minimum thresholds (see `[[12 — Synthetic Sandbox#11. Discoverability checklist]]` in vault). Re-dispatch any subagent whose fact count is below threshold.
4. Invoke `mcp-synthesizer.synthesize(run_id)` to merge facts and resolve conflicts. Block if unresolved conflicts on critical fields exist.
5. Invoke the three generators sequentially against the merged scratchpad:
   - `emit-openapi` → `artifacts/openapi.yaml`
   - `emit-mcp-server` → `artifacts/mcp-server/`
   - `emit-test-suite` → `artifacts/tests/`
6. Invoke `mcp-fidelity-auditor.audit(run_id)`. Output is `audit/report.md` plus per-scenario JSONL.
7. The `pre-promote` hook intercepts any subsequent file write outside the run directory and exits non-zero on FAIL — do NOT bypass.

## Exit conditions

- PASS: artifacts promoted out of the run directory; user is shown the install command for the generated MCP.
- HUMAN-REVIEW: artifacts stay in the run directory; reviewer is pointed at `audit/failed/`.
- FAIL: artifacts stay in the run directory; the failure summary is surfaced and dispatch stops.

## Don't

- Don't bypass the `pre-promote` hook on FAIL.
- Don't dispatch source agents serially as a "fallback" — parallel dispatch is the contract.
- Don't write outside `.atlas/runs/<run-id>/` until after the auditor PASS.
