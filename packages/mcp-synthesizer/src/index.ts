#!/usr/bin/env node
/**
 * @atlas/mcp-synthesizer — Atlas synthesizer MCP server.
 *
 * Day 0 skeleton. Implementation lands Day 4.
 *
 * Tools (planned):
 *   synthesize({ run_id }) → { merged_fact_count, unresolved_conflicts }
 *   conflicts({ run_id }) → Conflict[]
 *
 * Implementation is deterministic TypeScript — no LLM calls.
 * Chained-plan steps:
 *   1. detect — group facts by (fact_type, evidence_uri_canonical), surface disagreements
 *   2. resolve — apply policy (recency × source priority × evidence weight)
 *   3. emit — write merged facts back to scratchpad with provenance
 */

// TODO Day 4: chained-plan implementation.
// TODO Day 4: conflict-resolution policy in @atlas/shared so it is reusable / testable.

export {};
