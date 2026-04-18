#!/usr/bin/env node
/**
 * pre-promote hook — gates artifact promotion on Fidelity Auditor verdict.
 *
 * Contract:
 *   stdin / args: ignored (current implementation reads the latest .atlas/runs/<run-id>/audit/report.md)
 *   exit 0  → PASS or PASS-WITH-NOISE → Claude Code allows the promoting tool call
 *   exit 1  → FAIL                    → Claude Code blocks the tool call
 *   exit 2  → HUMAN-REVIEW             → Claude Code blocks until reviewed
 *
 *   stdout: one-line summary surfaced in Claude Code's hook output channel
 *   stderr: full reason on FAIL / HUMAN-REVIEW
 *
 * Day 0 skeleton. Implementation refined Day 6 of the build plan.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type RunVerdict = 'PASS' | 'PASS-WITH-NOISE' | 'HUMAN-REVIEW' | 'FAIL';

function findLatestRunDir(rootRunsDir: string): string | null {
  let candidates: { path: string; mtime: number }[];
  try {
    candidates = readdirSync(rootRunsDir).map((name) => {
      const p = join(rootRunsDir, name);
      return { path: p, mtime: statSync(p).mtimeMs };
    });
  } catch {
    return null;
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.path ?? null;
}

function parseVerdictFromReport(reportPath: string): RunVerdict | null {
  // TODO: Day 6 — parse audit/results.jsonl as the canonical source; report.md is human-readable.
  let content: string;
  try {
    content = readFileSync(reportPath, 'utf8');
  } catch {
    return null;
  }
  const match = /Run verdict:\s*(PASS-WITH-NOISE|PASS|HUMAN-REVIEW|FAIL)/i.exec(content);
  if (!match) return null;
  const v = match[1]?.toUpperCase();
  if (v === 'PASS' || v === 'PASS-WITH-NOISE' || v === 'HUMAN-REVIEW' || v === 'FAIL') {
    return v;
  }
  return null;
}

function main(): void {
  const cwd = process.cwd();
  const runsDir = join(cwd, '.atlas', 'runs');
  const latestRun = findLatestRunDir(runsDir);
  if (!latestRun) {
    process.stderr.write('atlas pre-promote: no audit report; refusing to promote\n');
    process.stdout.write('atlas: no audit report\n');
    process.exit(1);
  }
  const reportPath = join(latestRun, 'audit', 'report.md');
  const verdict = parseVerdictFromReport(reportPath);
  if (!verdict) {
    process.stderr.write(`atlas pre-promote: cannot parse verdict at ${reportPath}\n`);
    process.stdout.write('atlas: verdict unparseable\n');
    process.exit(1);
  }
  process.stdout.write(`atlas: ${verdict}\n`);
  switch (verdict) {
    case 'PASS':
    case 'PASS-WITH-NOISE':
      process.exit(0);
    case 'HUMAN-REVIEW':
      process.stderr.write('atlas pre-promote: HUMAN-REVIEW required; promotion blocked\n');
      process.exit(2);
    case 'FAIL':
      process.stderr.write('atlas pre-promote: FAIL; promotion blocked\n');
      process.exit(1);
  }
}

main();
