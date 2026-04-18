# Install Atlas

Atlas is a Claude Code-native plugin. It runs inside your existing Claude Code session on your Pro/Max plan — no API key, no separate runtime.

## Prerequisites

- Claude Code Pro or Max subscription (minimum supported version: TBD, pinned post-build-week)
- Node.js 20.11.0 or newer
- pnpm 9 or newer (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker (only if you want to run the synthetic sandbox in `apps/sandbox/`)

## Steps

```bash
# 1. Clone
git clone <repo-url> atlas-mcp
cd atlas-mcp

# 2. Install dependencies and build the MCP servers
pnpm install
pnpm build

# 3. Install the plugin into Claude Code
# Option A — global, available in every Claude Code project
cp -r .claude/ ~/.claude/atlas/

# Option B — per-project, only inside one repo
cp -r .claude/ /path/to/your/project/.claude/

# 4. Restart Claude Code
```

After restart, run inside Claude Code:

```
/atlas reverse-engineer <target>
```

Where `<target>` is either a URL of a running legacy UI or a filesystem path to a legacy codebase.

## Verifying the install

```bash
pnpm smoke
```

Should print `atlas smoke OK (Day 0 placeholder)` and exit 0.

## Marketplace

Marketplace publication is post-MVP. For now, install via clone + copy.

## Uninstall

```bash
rm -rf ~/.claude/atlas/    # if installed globally
# or
rm -rf /path/to/your/project/.claude/    # if installed per-project
```
