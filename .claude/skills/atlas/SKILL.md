---
name: atlas
description: Reverse-engineer a legacy target into deployable OpenAPI + MCP + fidelity-test artifacts. Dispatches four discovery subagents in parallel, synthesizes their findings via deterministic policy, generates artifacts (Day 5+), and gates promotion on the Fidelity Auditor (Day 6+).
tools: mcp__atlas-scratchpad__*, mcp__atlas-synthesizer__*, mcp__atlas-generators__*, mcp__atlas-fidelity-auditor__*, mcp__atlas-traffic-sniffer__*, Agent, Read, Write, Bash
---

# /atlas — Atlas orchestrator skill

## Invocation

```
/atlas reverse-engineer <target> [--scope <hint>] [--output <dir>]
```

- `<target>` — URL of a running legacy UI (e.g. `http://localhost:8080`) OR filesystem path to a legacy codebase root
- `--scope` — optional natural-language hint to narrow exploration (e.g. `"invoice issuance only"`)
- `--output` — optional output directory; defaults to `.atlas/runs/<run_id>/`

## Run directory convention

```
.atlas/runs/<run_id>/
├── scratchpad.sqlite          # facts + merged_facts (mcp-scratchpad-managed)
├── transcripts/               # per-subagent transcripts captured by Claude Code
├── golden.har                 # mcp-traffic-sniffer output (when applicable)
├── conflicts.md               # human-review surface (Phase 4)
├── artifacts/                 # generated OpenAPI / MCP / tests (Day 5+)
│   ├── openapi.yaml
│   ├── mcp-server/
│   └── tests/
└── audit/                     # Fidelity Auditor output (Day 6+)
    ├── results.jsonl
    ├── coverage.md
    ├── failed/
    └── report.md
```

## Phase 1 — Initialize run

1. Generate `run_id` of the form `atlas-YYYYMMDD-HHMMSS-<random4>` using the current UTC timestamp.
2. Create the run directory at `.atlas/runs/<run_id>/`.
3. Set environment so MCPs share the scratchpad path:
    - `ATLAS_RUN_ID=<run_id>`
    - `ATLAS_SCRATCHPAD_PATH=.atlas/runs/<run_id>/scratchpad.sqlite`
    - `ATLAS_RUNS_ROOT=.atlas/runs`
4. Call `mcp__atlas-scratchpad__migrate` to ensure schema is in place. This is idempotent.

## Phase 2 — Dispatch source agents (parallel)

Use the `Agent` tool to invoke the four source-agent subagents IN PARALLEL. Per-agent budgets and tool surfaces are declared in their respective `.claude/agents/*.md` files.

| Subagent          | Inputs                                                  | Token target | Wall-clock | Tool-call cap |
| ----------------- | ------------------------------------------------------- | ------------ | ---------- | ------------- |
| `code-spelunker`  | `run_id`, `target_path`, `scope_hint?`                  | 200K         | 30 min     | 500           |
| `ui-explorer`     | `run_id`, `target_url`, `entry_path?`, `auth_artifact?` | 400K         | 45 min     | 200           |
| `traffic-sniffer` | `run_id`, `correlation_with: ["ui-explorer", "manual"]` | 100K         | 30 min     | n/a           |
| `doc-harvester`   | `run_id`, `corpus_path`, `external_search_terms?`       | 150K         | 20 min     | 100           |

Dispatch all four with a single message containing four parallel `Agent` invocations. Wait for all to return.

## Phase 3 — Verify discovery

Read fact counts per source via `mcp__atlas-scratchpad__read_facts({ run_id, source_agent })`.

Minimum thresholds (calibrated against the synthetic sandbox in `[[12 — Synthetic Sandbox]]`):

| Source          | Minimum facts |
| --------------- | ------------- |
| code-spelunker  | 30            |
| ui-explorer     | 12            |
| traffic-sniffer | 8             |
| doc-harvester   | 10            |
| **total**       | **≥ 60**      |

If any source is below threshold, re-dispatch that subagent with a stricter `scope_hint` derived from the gap. Cap re-dispatches at 1 per source. If the gap persists, write a `partial_progress` summary to the run directory and surface the gap to the operator before proceeding to Phase 4.

## Phase 4 — Synthesize

1. Call `mcp__atlas-synthesizer__synthesize({ run_id })`. Returns `{ source_fact_count, merged_count, resolutions, unresolved_count }`.
2. If `unresolved_count > 0`, call `mcp__atlas-synthesizer__conflicts({ run_id })` and write a human-review report at `.atlas/runs/<run_id>/conflicts.md` listing each unresolved key, the conflicting source fact ids, and the candidate contents.
3. If `unresolved_count > 0` AND the operator did not pass `--ignore-conflicts`, halt the run with a clear summary. The Generators stage (Phase 5) requires a clean merge.

## Phase 5 — Generators

Sequentially invoke the three generator tools against the cleaned merged_facts set. Each writes deterministic output under `.atlas/runs/<run_id>/artifacts/`. Each tool is independent — failures are reported but do not block the others, since the auditor (Phase 6) runs against whatever was emitted.

1. `mcp__atlas-generators__emit_openapi({ run_id })` → writes `artifacts/openapi.yaml`. Returns `{ path_count, schema_count, written_to }`. Spec carries `x-atlas-evidence` extensions on every operation and schema, pointing back at the source fact ids.
2. `mcp__atlas-generators__emit_mcp_server({ run_id })` → writes `artifacts/mcp-server/` (package.json, tsconfig.json, README.md, src/index.ts). Returns `{ tool_count, files_written }`. The generated server reads `ATLAS_UPSTREAM_BASE_URL` to route requests to the legacy.
3. `mcp__atlas-generators__emit_test_suite({ run_id })` → writes `artifacts/tests/` (package.json, vitest.config.ts, tests/replay.test.ts). Returns `{ scenario_count, files_written }`. One vitest case per `http_request`/`http_response` scenario pair captured by Traffic Sniffer.

If `path_count === 0` OR `tool_count === 0`, the run did not yield enough discovery to be deployable; surface that to the operator and halt before Phase 6.

## Phase 6 — Audit (Day 6+)

## Phase 6 — Audit

After Phase 5 emits artifacts, build the auditor input by pairing each `http_request`/`http_response` scenario captured by Traffic Sniffer (legacy_response) with the same request executed against the generated MCP (candidate_response). Then call:

```
mcp__atlas-fidelity-auditor__audit({
  run_id,
  audit_dir: ".atlas/runs/<run_id>/audit",
  scenarios: [...],
  pass_threshold: 0.9,
  noise_allowlist: ["$.timestamp", "$.request_id", "$.fiscal_sequence", "$.control_number"],
  normalization: {
    scrub_paths: ["$.timestamp", "$.request_id"],
    masks: [
      { pattern: "VE-\\d+", replacement: "VE-<n>" }
    ]
  }
})
```

The auditor writes `audit/results.jsonl`, `audit/report.md`, `audit/coverage.md`, and `audit/failed/` under the run directory. The first non-blank line of `report.md` is `Run verdict: <PASS|PASS-WITH-NOISE|HUMAN-REVIEW|FAIL>` — the `pre-promote` hook parses that line.

If the run verdict is FAIL or unattended HUMAN-REVIEW, the `pre-promote` hook (`.claude/hooks/pre-promote.sh`) blocks any subsequent file write outside `.atlas/runs/<run_id>/`. Do not attempt to bypass.

## Exit conditions

- **PASS** (Day 5 scope) — `unresolved_count === 0`, per-source thresholds met, all three generators emitted non-empty artifacts. Synthesis + generation report surfaced to operator.
- **HUMAN-REVIEW** — `unresolved_count > 0`. Run directory retains source facts + (any) merged_facts; `conflicts.md` lists what to resolve. Generators are NOT invoked.
- **FAIL** — A source-agent subagent returned an error envelope; per-source threshold cannot be reached after one re-dispatch attempt; OR a generator exited with `WRITE_FAILED` / `NO_MERGED_FACTS`. Run directory retained for diagnostics; operator decides whether to retry or abort.

## Don't

- Don't dispatch source agents serially as a fallback — parallel dispatch is the contract per `[[04 — Architecture#2. Orchestrator]]`.
- Don't bypass `mcp__atlas-scratchpad` to write directly to the SQLite file — the cross-agent invariant is enforced at the MCP layer.
- Don't promote artifacts when `unresolved_count > 0` unless the operator explicitly opts in. The deterministic auditor (Day 6+) will refuse anyway, but Phase 5 must respect the same gate.
- Don't re-dispatch a subagent more than once per run.
- Don't write outside `.atlas/runs/<run_id>/` until artifact promotion (post-audit).
