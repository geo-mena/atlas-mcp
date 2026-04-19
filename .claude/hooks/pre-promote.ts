#!/usr/bin/env node
/**
 * pre-promote hook — gates artifact promotion on Fidelity Auditor verdict.
 *
 * Wired in .claude/settings.json under hooks.PreToolUse with matcher
 * "Write|Edit|MultiEdit". Claude Code invokes this command before any
 * matching tool call, passing a JSON envelope on stdin:
 *
 *   {
 *     session_id, transcript_path, cwd, permission_mode, hook_event_name,
 *     tool_name, tool_use_id,
 *     tool_input: { file_path?, content? ... }
 *   }
 *
 * Decision tree:
 *   - file_path is inside any `.atlas/runs/<run-id>/`        → exit 0 (allow; intra-run scratch)
 *   - no Atlas run on disk OR no audit/report.md yet         → exit 0 (nothing to gate)
 *   - audit verdict is PASS or PASS-WITH-NOISE               → exit 0 (allow promotion)
 *   - audit verdict is FAIL or HUMAN-REVIEW                  → exit 2 (block; stderr explains)
 *
 * Per Claude Code hook contract: exit 0 = success/allow, exit 2 = blocking
 * error (stderr fed back to the model). Any other exit code is a non-blocking
 * warning. We never use exit 1 here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

type RunVerdict = 'PASS' | 'PASS-WITH-NOISE' | 'HUMAN-REVIEW' | 'FAIL';

interface HookInput {
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
}

function readStdinSync(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseInput(): HookInput {
  const raw = readStdinSync().trim();
  if (raw === '') return {};
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

function findLatestRunDir(runsDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(runsDir);
  } catch {
    return null;
  }
  const candidates = entries
    .map((name) => {
      const path = join(runsDir, name);
      try {
        return { path, mtime: statSync(path).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((c): c is { path: string; mtime: number } => c !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.path ?? null;
}

function parseVerdict(reportPath: string): RunVerdict | null {
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
  const input = parseInput();
  const cwd = input.cwd ?? process.cwd();
  const filePath = input.tool_input?.file_path ?? '';

  // Intra-run scratchpad writes are always allowed; the auditor itself writes
  // there to produce the verdict the hook later reads.
  const intraRunMarker = `${join('.atlas', 'runs')}${sep}`;
  if (filePath.includes(intraRunMarker) || filePath.includes('/.atlas/runs/')) {
    process.exit(0);
  }

  const runsDir = join(cwd, '.atlas', 'runs');
  const latestRun = findLatestRunDir(runsDir);
  if (latestRun === null) {
    // No Atlas run in flight; nothing to gate.
    process.exit(0);
  }

  const verdict = parseVerdict(join(latestRun, 'audit', 'report.md'));
  if (verdict === null) {
    // Run exists but no audit report yet (still discovering / synthesizing /
    // generating). The hook is only meaningful post-audit.
    process.exit(0);
  }

  if (verdict === 'PASS' || verdict === 'PASS-WITH-NOISE') {
    process.exit(0);
  }

  process.stderr.write(
    `atlas pre-promote: ${verdict} verdict for run at ${latestRun}; ` +
      `promotion blocked. Resolve audit/failed/ or audit/report.md before retrying.\n`,
  );
  process.exit(2);
}

main();
