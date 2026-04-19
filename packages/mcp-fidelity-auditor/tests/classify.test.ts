import { describe, expect, it } from 'vitest';

import { aggregateRunVerdict, classify } from '../src/classify.js';
import type { DiffResult } from '../src/diff.js';

function diff(equal: boolean, changes: DiffResult['changes'] = []): DiffResult {
    return { equal, content_type: 'application/json', changes, summary: 'test' };
}

describe('classify', () => {
    it('PASS when diff.equal=true', () => {
        expect(classify(diff(true)).verdict).toBe('PASS');
    });

    it('PASS-WITH-NOISE when all changes inside noise_allowlist', () => {
        const result = classify(
            diff(false, [
                { type: 'CHANGE', path: ['timestamp'], old: 'x', new: 'y' },
                { type: 'CHANGE', path: ['request_id'], old: 'a', new: 'b' },
            ]),
            { noise_allowlist: ['$.timestamp', '$.request_id'] },
        );
        expect(result.verdict).toBe('PASS-WITH-NOISE');
    });

    it('HUMAN-REVIEW when only some changes are allowlisted', () => {
        const result = classify(
            diff(false, [
                { type: 'CHANGE', path: ['timestamp'], old: 'x', new: 'y' },
                { type: 'CHANGE', path: ['amount'], old: 100, new: 110 },
            ]),
            { noise_allowlist: ['$.timestamp'] },
        );
        expect(result.verdict).toBe('HUMAN-REVIEW');
    });

    it('FAIL when all changes are unexplained', () => {
        const result = classify(
            diff(false, [{ type: 'CHANGE', path: ['amount'], old: 100, new: 110 }]),
        );
        expect(result.verdict).toBe('FAIL');
    });

    it('text-only diff falls under text_noise_max → PASS-WITH-NOISE', () => {
        const result = classify(
            diff(false, [{ type: 'CHANGE', path: [], old: 'abc', new: 'abcd' }]),
            { text_noise_max: 5 },
        );
        expect(result.verdict).toBe('PASS-WITH-NOISE');
    });

    it('text-only diff exceeding text_noise_max → FAIL', () => {
        const result = classify(
            diff(false, [{ type: 'CHANGE', path: [], old: 'abc', new: 'abcdefghij' }]),
            { text_noise_max: 2 },
        );
        expect(result.verdict).toBe('FAIL');
    });
});

describe('aggregateRunVerdict', () => {
    it('FAIL when any scenario is FAIL, regardless of count', () => {
        const r = aggregateRunVerdict([
            { verdict: 'PASS', reason: '' },
            { verdict: 'PASS', reason: '' },
            { verdict: 'FAIL', reason: '' },
        ]);
        expect(r.verdict).toBe('FAIL');
    });

    it('PASS when ≥ threshold and zero HUMAN-REVIEW', () => {
        const r = aggregateRunVerdict(
            [
                { verdict: 'PASS', reason: '' },
                { verdict: 'PASS', reason: '' },
                { verdict: 'PASS-WITH-NOISE', reason: '' },
            ],
            0.9,
        );
        expect(r.verdict).toBe('PASS');
        expect(r.coverage_pct).toBeCloseTo(1);
    });

    it('HUMAN-REVIEW when ≥ threshold but at least one HUMAN-REVIEW present', () => {
        const r = aggregateRunVerdict(
            [
                { verdict: 'PASS', reason: '' },
                { verdict: 'PASS', reason: '' },
                { verdict: 'HUMAN-REVIEW', reason: '' },
            ],
            0.5,
        );
        expect(r.verdict).toBe('HUMAN-REVIEW');
    });

    it('FAIL when coverage below threshold', () => {
        const r = aggregateRunVerdict(
            [
                { verdict: 'PASS', reason: '' },
                { verdict: 'HUMAN-REVIEW', reason: '' },
                { verdict: 'HUMAN-REVIEW', reason: '' },
            ],
            0.9,
        );
        expect(r.verdict).toBe('FAIL');
    });

    it('FAIL on empty input (defensive)', () => {
        expect(aggregateRunVerdict([]).verdict).toBe('FAIL');
    });
});
