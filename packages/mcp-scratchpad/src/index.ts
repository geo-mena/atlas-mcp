#!/usr/bin/env node
/**
 * @atlas/mcp-scratchpad — Atlas scratchpad MCP server.
 *
 * Day 0 skeleton. Implementation lands Day 1.
 *
 * Tools (planned):
 *   write_fact(fact: Fact) → { id }
 *   read_facts({ run_id, source_agent?, fact_type? }) → Fact[]
 *   list_runs() → { run_id, fact_count, started_at }[]
 *   migrate() → void   # idempotent schema bootstrap
 *
 * Backend: better-sqlite3, file at .atlas/runs/<run-id>/scratchpad.sqlite (per Q23 default).
 * Schema is Postgres-ready (no SQLite-specific syntax beyond JSON1).
 */

// TODO Day 1: implement MCP server using @modelcontextprotocol/sdk.
// TODO Day 1: schema migration on first connect.
// TODO Day 1: refuse writes that violate the cross-agent invariants
//             (source_agent, evidence_uri, confidence required).

export {};
