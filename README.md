# Atlas

> Reverse-engineer legacy software into deployable OpenAPI + MCP + fidelity tests, inside Claude Code.

Atlas is a Claude Code-native plugin in TypeScript. It runs four discovery subagents in parallel against a legacy target (source code, running UI, HTTP traffic, tribal documentation), synthesizes their findings into a merged fact set via deterministic conflict resolution, generates an OpenAPI 3.1 specification + a TypeScript MCP server scaffold + a Vitest + nock test suite, and gates artifact promotion behind a Fidelity Auditor that compares legacy and candidate responses byte-for-byte after per-content-type normalization.

Atlas runs inside the user's Claude Code session on their Pro/Max plan — no external API key is required, no separate runtime, no cloud.

## Why

Legacy reverse-engineering is the slowest gate in any monolith-to-microservices migration. The validation case for Atlas is DHL's CRA8 → CRA10 migration, where each country eBilling subsystem currently costs ~16 hours of analyst time per Jira story. Atlas is general-purpose; the hackathon is the first delivery target, not the only one.

## Architecture

```mermaid
flowchart TD
  user[User: /atlas reverse-engineer &lt;target&gt;] --> skill[/atlas skill]

  subgraph claudecode[Claude Code session — Pro/Max]
    skill -->|dispatch| codeS[code-spelunker subagent]
    skill -->|dispatch| uiE[ui-explorer subagent]
    skill -->|dispatch| trS[traffic-sniffer subagent]
    skill -->|dispatch| docH[doc-harvester subagent]
  end

  subgraph mcps[Atlas-shipped MCPs — stdio subprocesses]
    scratch[mcp-scratchpad &#40;SQLite&#41;]
    synth[mcp-synthesizer &#40;deterministic&#41;]
    sniff[mcp-traffic-sniffer &#40;mitmdump&#41;]
    gens[mcp-generators]
    audit[mcp-fidelity-auditor]
  end

  codeS -->|facts| scratch
  uiE -->|facts| scratch
  trS -->|facts| scratch
  docH -->|facts| scratch
  trS --> sniff

  skill -->|after discovery| synth
  synth -->|read facts| scratch
  synth -->|merged_facts| scratch

  skill -->|after synthesis| gens
  gens --> openapi[artifacts/openapi.yaml]
  gens --> mcpscaffold[artifacts/mcp-server/]
  gens --> tests[artifacts/tests/]

  skill -->|after generation| audit
  audit --> report[audit/report.md]
  report --> hook[pre-promote hook]
  hook -->|PASS| promoted[artifact bundle promoted]
  hook -->|FAIL / HUMAN-REVIEW| blocked[promotion blocked]
```

## Install

```bash
git clone <repo-url> atlas-mcp
cd atlas-mcp
pnpm install
pnpm build
cp -r .claude/ ~/.claude/atlas/    # global, or per-project ./your-project/.claude/
```

Restart Claude Code, then run inside the session:

```
/atlas reverse-engineer <target>
```

Where `<target>` is a URL of a running legacy UI or a filesystem path to a legacy codebase.

Marketplace publication is post-MVP. See [`docs/INSTALL.md`](docs/INSTALL.md) for full details and per-project install layout.

## Quick smoke (no Claude Code required)

The repo ships two deterministic checks that exercise the architecture without any LLM, network, or Docker:

```bash
pnpm smoke    # ~1s — validates each layer in isolation
pnpm e2e      # ~3s — runs the full pipeline end-to-end on synthetic facts
```

`pnpm e2e` writes synthetic source-agent facts into a temporary scratchpad, runs the synthesizer, all three generators, and the auditor, and asserts the run-level verdict is `PASS`. It prints a one-line JSON summary of the pipeline state on success.

## Sandbox demo target

The `apps/sandbox/` directory contains a PHP 8.3 eBilling fixture (Docker Compose: nginx + PHP-FPM + MySQL + a synthetic SENIAT mock returning `urn:atlas:sandbox:seniat:v1` envelopes). It is the demo target for Atlas's reverse-engineering pipeline. It uses **no real DHL data, no real SENIAT specifications, no real credentials** — purely a development-time fixture.

```bash
pnpm sandbox:up        # docker compose up -d
pnpm sandbox:seed      # load deterministic seed (5 customers, 10 products, 3 invoices)
# UI:    http://localhost:8080/ve/invoice
# Mock:  http://localhost:8081/seniat-mock/health
pnpm sandbox:down
pnpm sandbox:reset     # drop volumes + reseed
```

## Project layout

| Path | Purpose |
|---|---|
| [`.claude/`](.claude/) | Plugin bundle (skills, subagents, MCP wiring, hooks) |
| [`packages/mcp-scratchpad/`](packages/mcp-scratchpad/) | SQLite fact store with cross-agent invariant validation |
| [`packages/mcp-synthesizer/`](packages/mcp-synthesizer/) | Deterministic chained-plan conflict resolution |
| [`packages/mcp-traffic-sniffer/`](packages/mcp-traffic-sniffer/) | mitmdump subprocess + Playwright wrapper |
| [`packages/mcp-fidelity-auditor/`](packages/mcp-fidelity-auditor/) | Byte-level diff with per-content-type normalization |
| [`packages/generators/`](packages/generators/) | OpenAPI / MCP scaffold / Vitest test suite emitters |
| [`packages/shared/`](packages/shared/) | Cross-package types and zod schemas |
| [`apps/sandbox/`](apps/sandbox/) | Synthetic PHP eBilling demo target |
| [`scripts/`](scripts/) | Bootstrap, smoke, e2e |
| [`docs/`](docs/) | Repo-local docs |

## Stack

Node 20+ · pnpm 9 workspace · TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) · Vitest · tsup · ESLint + Prettier · `@modelcontextprotocol/sdk` · `better-sqlite3` · `microdiff` · `xml-c14n` + `xml-crypto` · `parse5` · `pdf-parse` · `playwright` · `nock` · `yaml`.

## Status

Day 6 of 7 complete (per the `09 — Build Plan.md` in the design vault). Six MCP / generator packages, 86 unit tests passing, two deterministic smoke scripts (`pnpm smoke`, `pnpm e2e`), CI on every push.

| Layer | Status |
|---|---|
| Plugin bundle (`.claude/skills`, `.claude/agents`, `.claude/hooks`) | ✅ shipped |
| `mcp-scratchpad` | ✅ real |
| `mcp-traffic-sniffer` | ✅ real (mitmproxy subprocess) |
| `mcp-synthesizer` | ✅ real (deterministic chained plan) |
| `@atlas/generators` | ✅ real (OpenAPI + MCP scaffold + tests) |
| `mcp-fidelity-auditor` | ✅ real (per-content-type normalize + diff + classify) |
| `pre-promote` hook | ✅ wired (parses `Run verdict:` line) |
| Synthetic PHP sandbox | ✅ end-to-end against Docker Compose |

## Design

The canonical design lives in an Obsidian vault outside this repo. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a one-paragraph overview and pointers.

For repo-level coding conventions, see the root [`CLAUDE.md`](CLAUDE.md). It is loaded automatically by Claude Code in this directory and documents the do/don't rules.

## License

MIT. See [`LICENSE`](LICENSE).
