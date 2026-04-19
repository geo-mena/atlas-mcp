import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditScenarios, type ScenarioInput } from '../src/audit.js';
import { writeReports } from '../src/report.js';

function jsonResponse(
    status: number,
    payload: unknown,
): { status: number; content_type: string; body: string } {
    return { status, content_type: 'application/json', body: JSON.stringify(payload) };
}

function scenario(id: string, legacy: unknown, candidate: unknown, status = 200): ScenarioInput {
    return {
        scenario_id: id,
        request: { method: 'POST', url: 'http://x/y' },
        legacy_response: jsonResponse(status, legacy),
        candidate_response: jsonResponse(status, candidate),
    };
}

describe('auditScenarios', () => {
    it('PASS when all scenarios match byte-for-byte', () => {
        const result = auditScenarios(
            [scenario('a', { x: 1 }, { x: 1 }), scenario('b', { y: 2 }, { y: 2 })],
            { run_id: 'r' },
        );
        expect(result.run_verdict).toBe('PASS');
        expect(result.coverage_pct).toBe(1);
        expect(result.counts.PASS).toBe(2);
    });

    it('FAIL on status mismatch regardless of body', () => {
        const result = auditScenarios(
            [
                {
                    scenario_id: 'mismatch',
                    request: { method: 'GET', url: 'http://x' },
                    legacy_response: jsonResponse(200, { ok: true }),
                    candidate_response: jsonResponse(500, { ok: true }),
                },
            ],
            { run_id: 'r' },
        );
        expect(result.run_verdict).toBe('FAIL');
        expect(result.scenarios[0]?.status_match).toBe(false);
    });

    it('PASS-WITH-NOISE when changes are inside the noise allowlist', () => {
        const result = auditScenarios([scenario('a', { x: 1, ts: 'old' }, { x: 1, ts: 'new' })], {
            run_id: 'r',
            classify: { noise_allowlist: ['$.ts'] },
        });
        expect(result.scenarios[0]?.verdict).toBe('PASS-WITH-NOISE');
        // PASS-WITH-NOISE counts as "good" so run_verdict aggregates to PASS at 100% coverage.
        expect(result.run_verdict).toBe('PASS');
    });

    it('HUMAN-REVIEW when partial allowlist coverage', () => {
        const result = auditScenarios([scenario('a', { x: 1, ts: 'old' }, { x: 2, ts: 'new' })], {
            run_id: 'r',
            classify: { noise_allowlist: ['$.ts'] },
        });
        expect(result.scenarios[0]?.verdict).toBe('HUMAN-REVIEW');
        expect(result.run_verdict).toBe('FAIL'); // single HUMAN-REVIEW means coverage 0%
    });

    it('FAIL on empty scenario set (caught at run-level aggregation)', () => {
        const result = auditScenarios([], { run_id: 'r' });
        expect(result.run_verdict).toBe('FAIL');
        expect(result.scenarios).toHaveLength(0);
    });
});

describe('writeReports', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), 'atlas-auditor-report-'));
    });

    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    it('writes results.jsonl, report.md, coverage.md, and failed/ payloads', () => {
        const result = auditScenarios(
            [scenario('pass', { x: 1 }, { x: 1 }), scenario('fail', { x: 1 }, { x: 2 })],
            { run_id: 'r' },
        );
        const paths = writeReports(result, tmp);

        const jsonl = readFileSync(paths.results_jsonl, 'utf8');
        expect(jsonl.split('\n').filter((l) => l).length).toBe(2);

        const reportMd = readFileSync(paths.report_md, 'utf8');
        expect(reportMd).toContain('Run verdict: FAIL');
        expect(reportMd).toContain('## Failures');
        expect(reportMd).toContain('`fail`');

        const coverageMd = readFileSync(paths.coverage_md, 'utf8');
        expect(coverageMd).toContain('| `application/json` |');

        const failedPayload = readFileSync(join(paths.failed_dir, 'fail.json'), 'utf8');
        expect(failedPayload).toContain('"scenario_id": "fail"');
    });
});
