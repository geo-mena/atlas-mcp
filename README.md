# Atlas

> Reverse-engineer legacy software into deployable OpenAPI + MCP + fidelity tests, inside Claude Code.

Atlas is a Claude Code-native plugin in TypeScript. It runs four parallel discovery subagents against a legacy target (running code, UI, HTTP traffic, tribal docs), synthesizes their findings into a merged fact set, generates an OpenAPI 3.1 specification + a TypeScript MCP server scaffold + a Vitest + nock test suite, and gates artifact promotion behind a Fidelity Auditor that proves byte-level behavioral equivalence with the legacy.

Atlas runs inside the user's Claude Code session on their Pro/Max plan. No external API key is required.

## Status

Pre-build. Day 0 scaffolding. Full design lives in the Obsidian vault at `/Users/geomena/Documents/obsidian/tofi/Atlas/` (start with `00 — MOC.md`).

## Install

```bash
git clone <repo-url> atlas-mcp
cd atlas-mcp
pnpm install
pnpm build
cp -r .claude/ ~/.claude/atlas/    # or per-project ./your-project/.claude/
```

Restart Claude Code, then run `/atlas reverse-engineer <target>`.

Marketplace publication is post-MVP.

## Project layout

See `docs/ARCHITECTURE.md` for a short pointer; the canonical design is in the Obsidian vault.

| Path | Purpose |
|---|---|
| `.claude/` | Plugin bundle (skills, subagents, MCP wiring, hooks) |
| `packages/` | TypeScript MCP servers shipped by Atlas |
| `apps/sandbox/` | Synthetic PHP eBilling sandbox — demo target |
| `docs/` | Repo-local docs |
| `scripts/` | Bootstrap and smoke scripts |

## Stack

Node 20+ · pnpm 9 workspace · TypeScript strict · Vitest · tsup · ESLint + Prettier.

## License

MIT.
