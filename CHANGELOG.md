# Changelog

All notable changes to Atlas. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to semantic versioning.

## [0.1.0-alpha.0] — Unreleased

First end-to-end working version. Six MCP / generator packages, deterministic chained-plan synthesis, byte-level fidelity audit, generated OpenAPI + TypeScript MCP scaffold + Vitest replay suite, plugin bundle for Claude Code Pro/Max.

### Added — plugin bundle (`.claude/`)

- `skills/atlas.md` — orchestrator skill. Parses `/atlas reverse-engineer <target>`, dispatches the four source subagents in parallel, runs synthesis, generation, and audit through Phases 1–6.
- `agents/code-spelunker.md` — PHP source reader using tree-sitter and the Filesystem MCP.
- `agents/ui-explorer.md` — UI explorer driving Playwright MCP with snapshot-first / vision-as-escape-hatch and DOM-hash dedup.
- `agents/traffic-sniffer.md` — runtime ground-truth capturer driving `mcp-traffic-sniffer`.
- `agents/doc-harvester.md` — corpus / Jira / regulator-doc miner with RFC-2119 modal-verb extraction.
- `hooks/pre-promote.{ts,sh}` — gates artifact promotion on the `Run verdict:` line in `audit/report.md`. Exits 0 on PASS / PASS-WITH-NOISE, 1 on FAIL, 2 on HUMAN-REVIEW.
- `settings.json` — MCP server wiring with per-subagent `allowedTools` restrictions.
- `settings.local.json` — dev-only full permissions, gitignored.

### Added — `@atlas/shared`

- Type-safe `Fact`, `FactInput`, `FactFilter`, `MergedFact`, `MergedFactInput`, `MergedFactFilter`, `Verdict`, `Resolution` schemas (zod) and re-exported types.
- `ScratchpadError` with typed `code` field.
- Cross-package source-agent enum and confidence levels.

### Added — `@atlas/mcp-scratchpad`

- SQLite-backed fact store via `better-sqlite3`, Postgres-ready DDL with CHECK constraints on `source_agent` and `confidence`.
- `Scratchpad` class with `migrate`, `insertFact`, `selectFacts`, `countFacts`, `insertMergedFact`, `selectMergedFacts`, `deleteMergedFacts`, `countMergedFacts`.
- MCP tools: `write_fact`, `read_facts`, `migrate`. Refuses writes that violate the cross-agent invariant (missing `source_agent` / `evidence_uri` / `confidence`).
- 13 vitest tests covering schema migration idempotency, fact roundtrip, filter shapes, conflict-with handling, invariant rejections.

### Added — `@atlas/mcp-traffic-sniffer`

- `Proxy` class wrapping a `mitmdump` subprocess (`--listen-port`, `hardump`, `--quiet`) with injectable spawner for tests.
- `ProxyRegistry` enforcing one Proxy per `run_id`, explicit `ALREADY_RUNNING` / `NOT_RUNNING` errors.
- HAR helpers: `parseHar`, `readHarFile`, `entriesByEndpoint`, `summarizeHar`.
- MCP tools: `start_proxy`, `stop_proxy`, `dump_har`.
- 13 vitest tests covering proxy state, spawner injection, HAR parse + group + summarize.

### Added — `@atlas/mcp-synthesizer`

- Deterministic TypeScript chained-plan conflict resolution. No LLM calls.
- Source priority `traffic-sniffer (4) > code-spelunker (3) > ui-explorer (2) > doc-harvester (1)`; tie-break by recency, then confidence; remaining tie classified `unresolved` for human review.
- `logicalKey` per fact_type, `groupByKey`, `resolveGroup` decision tree (`unanimous` / `priority` / `recency` / `confidence` / `unresolved`).
- `synthesize(scratchpad, runId)` is idempotent: replaces prior `merged_facts` for the run.
- MCP tools: `synthesize`, `merged_facts`, `conflicts`.
- 18 vitest tests across policy and DB-backed orchestration.

### Added — `@atlas/generators`

- `emit_openapi` — OpenAPI 3.1 spec from merged_facts. Paths from `route` facts (methods grouped per path), component schemas from `field_definition` (with type coercion `decimal/integer/boolean → JSON Schema`), responses seeded from observed `http_response` status codes, `x-atlas-evidence` extensions on every operation and schema for provenance.
- `emit_mcp_server` — TypeScript MCP server scaffold (package.json, tsconfig, README, src/index.ts) with one tool per route. Tool naming: `${method}_${path_slug}`. InputSchema from `payload_field` facts. Implementation: `fetch()` to `ATLAS_UPSTREAM_BASE_URL`.
- `emit_test_suite` — Vitest + nock scaffold. One vitest case per `(http_request, http_response)` paired by `scenario_id`. Orphan requests (no matching response) dropped.
- 12 vitest tests across the three generators.

### Added — `@atlas/mcp-fidelity-auditor`

- Pure layers (testable without DB or HTTP):
  - `normalize` — per-content-type: JSON sort-keys + scrub-paths + regex masks; XML whitespace collapse + element scrub; HTML parse5 canonical + collapse; text trim + EOL normalize. PDF / binary identity (deferred).
  - `diff` — `microdiff` for JSON; equality post-normalize for XML / HTML / text. Status mismatch surfaces as a single change on the `status` path.
  - `classify` — DiffResult → Verdict. All-equal → PASS. All changes inside `noise_allowlist` → PASS-WITH-NOISE. Mixed allowlist coverage → HUMAN-REVIEW. Anything else → FAIL. Text-only diffs classify by `text_noise_max` chars.
  - `audit` — orchestrates per scenario; status mismatch is unconditional FAIL; aggregates run-level verdict via `aggregateRunVerdict` with default threshold 0.9.
  - `report` — emits `audit/{results.jsonl, report.md, coverage.md, failed/}`. The `Run verdict: X` line in `report.md` is load-bearing for the `pre-promote` hook.
- MCP tool: `audit({ run_id, audit_dir, scenarios, normalization?, noise_allowlist?, text_noise_max?, pass_threshold? })`.
- 30 vitest tests (8 normalize + 5 diff + 9 classify + 8 audit/report).

### Added — synthetic sandbox (`apps/sandbox/`)

- PHP 8.3 monolith fixture (front controller + InvoiceController + SeniatClient + POPO models + catalogs + views).
- Synthetic SENIAT mock service in Node returning `urn:atlas:sandbox:seniat:v1` XML envelopes with `xmldsig`-shaped signature stubs and configurable failure injection.
- MySQL 8.4 schema with foreign keys, fiscal sequence column, status enum, and audit log.
- Deterministic seed: 5 customers, 10 products, 3 invoices in different states.
- Confluence-style markdown corpus + synthetic Jira ticket (analog of CRA10-27064 with no DHL-specific content).
- Docker Compose orchestration (nginx + php + mysql + seniat-mock) with pinned image tags.

### Added — repo plumbing

- pnpm 9 workspace, TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`).
- Vitest at the workspace root.
- `tsup` per-package builds with split index/bin entries.
- ESLint flat config (typescript-eslint strict + import/order); Prettier (100 chars, single quotes, semicolons).
- `.editorconfig`, `.nvmrc`, `.gitignore` (with `.claude/settings.local.json` excluded).
- GitHub Actions CI: `lint-typecheck-test` + `smoke` jobs, Node 20 matrix, pnpm cache.
- `scripts/dev-bootstrap.sh` — one-shot local environment.
- `scripts/smoke.ts` — deterministic per-layer sanity check (no LLM, no network).
- `scripts/e2e.ts` — full pipeline rehearsal: synthetic facts → synth → emit → audit → assert PASS.
- `scripts/validate-agents.ts` — structural sanity check for `.claude/{agents,skills}/*.md` (frontmatter, required sections, known MCP tool prefixes). Wired into `pnpm smoke`.
- `pnpm` scripts for sandbox lifecycle (`sandbox:up`, `sandbox:seed`, `sandbox:down`, `sandbox:reset`).

### Notes

- Project memory and full design live in an Obsidian vault outside this repo. The repo-level CLAUDE.md captures the do/don't conventions for any Claude Code session working in this tree.
- Generated MCP scaffolds are TypeScript-only for v0.1; Python output target is deferred to v0.2.
- `pre-promote` hook field names in `.claude/settings.json` carry `_verify` markers — confirm against the live Claude Code schema during the hackathon week.
