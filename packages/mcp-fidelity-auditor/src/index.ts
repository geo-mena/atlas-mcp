#!/usr/bin/env node
/**
 * @atlas/mcp-fidelity-auditor — Atlas fidelity auditor MCP server.
 *
 * Day 0 skeleton. Implementation lands Day 6.
 *
 * Tools (planned):
 *   audit({ run_id }) → { run_verdict, scenarios: ScenarioResult[] }
 *   diff({ scenario_id, legacy_response, candidate_response }) → DiffResult
 *
 * Diff stack per content type:
 *   application/json → microdiff
 *   application/xml  → xml-c14n + microdiff on parsed tree (+ xml-crypto for signed envelopes)
 *   text/html        → parse5 canonicalization + text diff
 *   application/pdf  → pdf-parse text extraction + text diff
 *   binary           → SHA-256 equality after content-type-aware stripping
 *
 * Fail-closed: silence is rejection. ≥ 90% scenarios must PASS or PASS-WITH-NOISE,
 *              zero FAIL, remainder HUMAN-REVIEW for run-level PASS.
 */

// TODO Day 5/6: implement audit loop + per-content-type normalizers.
// TODO Day 6: emit audit/report.md and audit/results.jsonl in the run directory.

export {};
