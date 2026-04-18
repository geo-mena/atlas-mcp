# Atlas — Claude Code project memory

## What this is

Atlas is a **Claude Code-native plugin in TypeScript** that reverse-engineers legacy software (running code + UI + HTTP traffic + tribal docs) into deployable artifacts: an OpenAPI 3.1 spec, a TypeScript MCP server scaffold, and a Vitest + nock test suite. It runs inside the user's Claude Code session on their Pro/Max plan — no external API key is required.

The project is general-purpose. The Anthropic "Built with Opus 4.7" hackathon is the first delivery target, not the only one. Real first user is the maintainer's DHL squad (CRA8 → CRA10 migration); post-hackathon use cases include consulting work and open-source distribution.

## Distribution model

- Distributed as a `.claude/` plugin bundle (skills + subagents + MCP servers + hooks).
- Installed by users into their Claude Code Pro/Max via `git clone` + `cp -r .claude/` (marketplace publication is post-MVP).
- Token cost falls under the user's Claude Code plan quota — Atlas does NOT call the Anthropic API directly.
- Atlas dev (us) needs Pro/Max during build to test the plugin end-to-end.

## Architecture (committed 2026-04-18, post-pivot)

- **Orchestrator**: `/atlas` skill in `.claude/skills/atlas.md`. The orchestrator role is filled by Claude Code itself executing this skill — there is no Atlas process supervising other Atlas processes.
- **Source agents** (4 Claude Code subagents in `.claude/agents/`):
  - `code-spelunker.md` — reads PHP source via `tree-sitter-php` + Filesystem MCP
  - `ui-explorer.md` — drives Playwright MCP (vision 3.75 MP / 98.5% UI acuity)
  - `traffic-sniffer.md` — drives `mcp-traffic-sniffer`
  - `doc-harvester.md` — reads pre-exported corpus via Filesystem MCP + Exa MCP
- **Atlas-shipped MCP servers** (TypeScript, in `packages/`):
  - `mcp-scratchpad` — SQLite via `better-sqlite3`, Postgres-ready schema
  - `mcp-synthesizer` — deterministic chained-plan conflict resolution (no LLM calls)
  - `mcp-fidelity-auditor` — deterministic byte-level diff with `microdiff` / `xml-c14n` / `xml-crypto` / `parse5` / `pdf-parse`
  - `mcp-traffic-sniffer` — Playwright Node SDK + mitmproxy subprocess
- **External MCPs consumed**: official Playwright MCP, Filesystem MCP, Exa MCP.
- **Generators** (TS modules in plugin code, not MCPs): `emit-openapi`, `emit-mcp-server`, `emit-test-suite`.
- **Hook**: `.claude/hooks/pre-promote.ts` (with `.sh` shim). Reads the Fidelity Auditor verdict and exits non-zero on FAIL — gates artifact promotion fail-closed.

## Tech stack

- Node 20+ / pnpm 9 workspace
- TypeScript strict (target ES2022, module NodeNext, `exactOptionalPropertyTypes`)
- Vitest workspace mode (coverage v8)
- tsup for builds (ESM + types)
- eslint (typescript-eslint strict + import/order) + Prettier (100-char, semicolons, single quotes)
- Husky + lint-staged for pre-commit
- mitmproxy invoked as subprocess only (Python binary external dep)

## Validation case

DHL eBilling reverse-engineering. Reference Jira: `CRA10-27064` (Venezuela / SENIAT). The synthetic sandbox in `apps/sandbox/` mirrors the SHAPE of CRA8 without using DHL data, DHL credentials, or DHL hostnames.

## Full design (Obsidian vault)

`/Users/geomena/Documents/obsidian/tofi/Atlas/`

| Note | Content |
|---|---|
| `00 — MOC.md` | Index, vision, closed decisions, principles |
| `01 — Research Findings.md` | Opus 4.7 capabilities, MCP ecosystem, competition |
| `02 — Problem & Validation.md` | DHL pain quantified, generalization beyond DHL |
| `03 — MVP Scope.md` | Three deliverables, scope IN/OUT, success criteria |
| `04 — Architecture.md` | Component diagram, scratchpad schema, contracts |
| `05 — Source Agents.md` | Per-subagent definitions and contracts |
| `06 — Fidelity Auditor.md` | Audit loop, verdict classification, diff strategy |
| `07 — Risk Matrix.md` | Technical / demo / legal / strategic risks |
| `08 — Open Questions.md` | Decisions pending external inputs (non-blocking) |
| `09 — Build Plan.md` | 7-day execution plan with daily exit criteria |
| `10 — Repo Scaffolding.md` | This repo's layout, tooling, CI |
| `11 — Demo Script.md` | 3-minute pitch with timing and fallbacks |
| `12 — Synthetic Sandbox.md` | PHP eBilling sandbox spec (target of demo) |
| `Architecture.canvas` | Visual model |

## Conventions

- File naming: `NN — Title.md` with em-dash U+2014, English Title Case.
- Documentation tone: Principal Engineer — formal, technical, no value-adjectives ("robust", "comprehensive", "powerful"), no filler. Parentheses only for brief technical clarifications, abbreviations, units, references.
- Mermaid diagrams only when prose cannot convey the information.
- Source fidelity: never invent. Mark unknowns as TBD.

## Clean Code Principles

### Naming
- Names that reveal intent: `daysSinceLastTransaction` instead of `d`.
- Follow language conventions: camelCase, snake_case, PascalCase as appropriate.
- No ambiguous abbreviations or unnecessary prefixes.

### Functions
- Small, single-purpose. If you need "and" to describe what it does, split it.
- Short functions as a guideline, not a rigid rule. Prioritize readability over arbitrary metrics.
- Parameters: ideally ≤3. If more are needed, use an object/DTO.

### Structure
- DRY: duplicated code is multiplied technical debt. Extract to shared functions, utilities, or modules.
- Principle of least surprise: code should do exactly what its name suggests.
- Early return to reduce nesting.

### Error Handling
- Explicit handling: never silently ignore exceptions.
- Specific errors over generic ones. Descriptive messages that aid debugging.
- Validate inputs at system boundaries (controllers, handlers, APIs).

### Comments
- Only when they add value: explain the WHY, never the WHAT.
- If you need many comments, the code needs refactoring.
- TODO/FIXME with context: `// TODO(geovanni): migrate to new API when v1 is deprecated`

## Legacy Code
- Prioritize consistency with surrounding code over isolated "best practices".
- Propose refactors as a separate step, never mix them with the main task.

## When Delivering Code
- Brief summary of changes and reasoning behind non-obvious decisions.
- If there are trade-offs, mention them.
- If multiple files were touched, list which ones and why.

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install workspace deps |
| `pnpm build` | Build all packages with tsup |
| `pnpm test` | Vitest workspace mode |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm smoke` | Deterministic end-to-end sanity (no LLM, no Claude Code) |
| `pnpm sandbox:up` | Start synthetic PHP eBilling sandbox via Docker Compose |
| `pnpm sandbox:seed` | Load deterministic seed data into the sandbox |
| `pnpm sandbox:reset` | Drop volumes and re-seed |
| `bash scripts/dev-bootstrap.sh` | Full local bootstrap (sandbox + scratchpad + plugin install) |

## Don't

- Don't add a standalone CLI escape hatch in v0.1 — plugin-only is the distribution.
- Don't call the Anthropic API directly from Atlas code; the Claude Code session is the orchestrator.
- Don't use real DHL data, credentials, or hostnames anywhere in repo, demo, or tests (L3 risk).
- Don't generate normalization rules with LLMs in v0.1 — false-pass risk is too high.
- Don't ship Python code. TypeScript only for v0.1; Python output target deferred to v0.2.
- Don't bypass the `pre-promote` hook on FAIL or unattended HUMAN-REVIEW. The auditor is fail-closed by design.
- Don't masquerade timestamp / fiscal sequence masking as semantic equivalence — for signed XML, re-verify the signature with `xml-crypto`.

## Open questions (non-blocking for the build)

See `08 — Open Questions.md` in the Obsidian vault. Hackathon-specific items (Q1 slug verification, Q3 hackathon date, Q19 squad composition, Q20 submission brief) were downgraded to non-blocking on 2026-04-18 — Atlas is general-purpose and the hackathon is the first delivery target, not the only one.

## License

MIT. Repo is private during build, public at hackathon submission.
