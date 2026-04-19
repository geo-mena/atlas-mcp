import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Verdict } from '@atlas/shared';

import { AuditorError } from './errors.js';
import type { AuditResult, ScenarioResult } from './audit.js';

export interface ReportPaths {
  readonly results_jsonl: string;
  readonly report_md: string;
  readonly coverage_md: string;
  readonly failed_dir: string;
}

/**
 * writeReports — emit the four canonical artifacts of an audit run:
 *
 *   audit/results.jsonl — one record per scenario (machine-readable)
 *   audit/coverage.md   — aggregate coverage table per content type
 *   audit/report.md     — human-readable summary; the pre-promote hook parses
 *                         the "Run verdict:" line at the top to decide its
 *                         exit code, so the format is load-bearing
 *   audit/failed/       — directory of full diff payloads for FAIL scenarios
 */
export function writeReports(result: AuditResult, auditDir: string): ReportPaths {
  try {
    mkdirSync(auditDir, { recursive: true });
    mkdirSync(join(auditDir, 'failed'), { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuditorError('WRITE_FAILED', `cannot create audit directory at ${auditDir}: ${message}`);
  }

  const paths: ReportPaths = {
    results_jsonl: join(auditDir, 'results.jsonl'),
    report_md: join(auditDir, 'report.md'),
    coverage_md: join(auditDir, 'coverage.md'),
    failed_dir: join(auditDir, 'failed'),
  };

  try {
    writeFileSync(paths.results_jsonl, renderJsonl(result.scenarios), 'utf8');
    writeFileSync(paths.report_md, renderReportMd(result), 'utf8');
    writeFileSync(paths.coverage_md, renderCoverageMd(result), 'utf8');
    for (const scenario of result.scenarios) {
      if (scenario.verdict !== 'FAIL') continue;
      writeFileSync(
        join(paths.failed_dir, `${sanitize(scenario.scenario_id)}.json`),
        JSON.stringify(scenario, null, 2),
        'utf8',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuditorError('WRITE_FAILED', `cannot write audit artifacts: ${message}`);
  }

  return paths;
}

function renderJsonl(scenarios: readonly ScenarioResult[]): string {
  return scenarios.map((s) => JSON.stringify(s)).join('\n') + (scenarios.length > 0 ? '\n' : '');
}

function renderReportMd(result: AuditResult): string {
  const counts = result.counts;
  const total = totalCount(counts);

  const lines: string[] = [];
  lines.push(`# Fidelity Auditor — run ${result.run_id}`);
  lines.push('');
  lines.push(`Run verdict: ${result.run_verdict}`);
  lines.push('');
  lines.push(`- Total scenarios: ${total}`);
  lines.push(`- Coverage: ${(result.coverage_pct * 100).toFixed(2)}%`);
  lines.push(`- PASS: ${counts.PASS}`);
  lines.push(`- PASS-WITH-NOISE: ${counts['PASS-WITH-NOISE']}`);
  lines.push(`- HUMAN-REVIEW: ${counts['HUMAN-REVIEW']}`);
  lines.push(`- FAIL: ${counts.FAIL}`);
  lines.push('');

  const failed = result.scenarios.filter((s) => s.verdict === 'FAIL');
  if (failed.length > 0) {
    lines.push('## Failures');
    lines.push('');
    for (const f of failed) {
      lines.push(`- \`${f.scenario_id}\` — ${f.request.method} ${f.request.url}`);
      lines.push(`  - reason: ${f.reason}`);
      lines.push(`  - full diff: \`failed/${sanitize(f.scenario_id)}.json\``);
    }
    lines.push('');
  }

  const review = result.scenarios.filter((s) => s.verdict === 'HUMAN-REVIEW');
  if (review.length > 0) {
    lines.push('## Awaiting human review');
    lines.push('');
    for (const r of review) {
      lines.push(`- \`${r.scenario_id}\` — ${r.request.method} ${r.request.url}: ${r.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderCoverageMd(result: AuditResult): string {
  const byContentType = new Map<string, Record<Verdict, number>>();
  for (const scenario of result.scenarios) {
    const ct = scenario.diff.content_type;
    const bucket = byContentType.get(ct) ?? { PASS: 0, 'PASS-WITH-NOISE': 0, 'HUMAN-REVIEW': 0, FAIL: 0 };
    bucket[scenario.verdict] += 1;
    byContentType.set(ct, bucket);
  }

  const lines: string[] = [];
  lines.push(`# Coverage — run ${result.run_id}`);
  lines.push('');
  lines.push('| Content type | PASS | PASS-WITH-NOISE | HUMAN-REVIEW | FAIL |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [ct, counts] of [...byContentType.entries()].sort()) {
    lines.push(`| \`${ct}\` | ${counts.PASS} | ${counts['PASS-WITH-NOISE']} | ${counts['HUMAN-REVIEW']} | ${counts.FAIL} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function totalCount(counts: Readonly<Record<Verdict, number>>): number {
  return counts.PASS + counts['PASS-WITH-NOISE'] + counts['HUMAN-REVIEW'] + counts.FAIL;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
