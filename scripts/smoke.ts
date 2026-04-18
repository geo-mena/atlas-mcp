#!/usr/bin/env tsx
/**
 * Atlas smoke test — deterministic end-to-end sanity, no LLM, no Claude Code.
 *
 * Day 0: prints a fixed line and exits 0.
 * Day 1: write a known fact via @atlas/mcp-scratchpad, read it back, assert equality.
 * Day 4: invoke @atlas/mcp-synthesizer on the known fact set, assert merged output.
 *
 * The smoke test is the 10-second confidence signal for builders and CI.
 */

function main(): void {
  // TODO Day 1: import @atlas/mcp-scratchpad client, exercise write_fact + read_facts.
  // TODO Day 4: import @atlas/mcp-synthesizer client, exercise synthesize.
  process.stdout.write('atlas smoke OK (Day 0 placeholder)\n');
  process.exit(0);
}

main();
