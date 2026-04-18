# Architecture — short pointer

Atlas is a Claude Code-native plugin. The orchestrator is Claude Code itself, executing the `/atlas` skill in `.claude/skills/atlas.md`. Four discovery subagents (`code-spelunker`, `ui-explorer`, `traffic-sniffer`, `doc-harvester`) write structured facts to a SQLite-backed scratchpad MCP. A deterministic synthesizer MCP merges facts and resolves conflicts. Three TypeScript generators emit an OpenAPI 3.1 spec, a TypeScript MCP server scaffold, and a Vitest + nock test suite. A deterministic fidelity auditor MCP replays both legacy and the generated artifact and diffs byte-for-byte. A `pre-promote` Claude Code hook gates artifact promotion fail-closed.

For the canonical design (component diagrams, contracts, scratchpad schema, conflict-resolution policy, audit loop, risk matrix), consult the maintainer's Obsidian vault at `/Users/geomena/Documents/obsidian/tofi/Atlas/`:

| Note | Content |
|---|---|
| `04 — Architecture.md` | Component diagram, scratchpad schema, contracts |
| `05 — Source Agents.md` | Per-subagent definitions and contracts |
| `06 — Fidelity Auditor.md` | Audit loop, verdicts, diff strategy |
| `Architecture.canvas` | Visual model |

This file is intentionally short. Do not duplicate the vault here; keep one authoritative copy.
