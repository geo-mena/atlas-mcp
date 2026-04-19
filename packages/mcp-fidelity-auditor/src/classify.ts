import type { Verdict } from '@atlas/shared';

import type { DiffResult } from './diff.js';

export interface ScenarioClassification {
    readonly verdict: Verdict;
    readonly reason: string;
}

export interface ClassifyOptions {
    /** Allowed JSON paths whose disagreement degrades to PASS-WITH-NOISE. */
    readonly noise_allowlist?: readonly string[];
    /** Allowed text-mismatch sizes (chars) that degrade to PASS-WITH-NOISE. */
    readonly text_noise_max?: number;
}

const DEFAULT_TEXT_NOISE_MAX = 0;

/**
 * classify — turn a DiffResult into a per-scenario verdict.
 *
 * Decision tree (per [[06 — Fidelity Auditor#4. Verdict Classification]]):
 *   - equal                                       → PASS
 *   - all changes inside noise_allowlist          → PASS-WITH-NOISE
 *   - structural disagreement, business-equivalent likely
 *     (only paths flagged as "minor" via allowlist OR text mismatch
 *      <= text_noise_max bytes)                   → HUMAN-REVIEW
 *   - any unexplained mismatch                    → FAIL
 *
 * The auditor is fail-closed: ambiguity always falls through to FAIL rather
 * than silent acceptance.
 */
export function classify(diff: DiffResult, options: ClassifyOptions = {}): ScenarioClassification {
    if (diff.equal) {
        return { verdict: 'PASS', reason: 'normalized payloads are byte-equivalent' };
    }

    if (diff.changes.length === 0) {
        // Defensive: equal=false but no changes — treat as FAIL with explicit reason.
        return { verdict: 'FAIL', reason: 'diff layer reported inequality with no change list' };
    }

    const allowlist = options.noise_allowlist ?? [];
    const textNoiseMax = options.text_noise_max ?? DEFAULT_TEXT_NOISE_MAX;

    // Text-only diffs (path=[]): classify by magnitude.
    const isTextDiff = diff.changes.length === 1 && diff.changes[0]?.path.length === 0;
    if (isTextDiff) {
        const change = diff.changes[0];
        const oldLen = String(change?.old ?? '').length;
        const newLen = String(change?.new ?? '').length;
        const sizeDelta = Math.abs(oldLen - newLen);
        if (sizeDelta <= textNoiseMax) {
            return {
                verdict: 'PASS-WITH-NOISE',
                reason: `text mismatch within text_noise_max (${sizeDelta} ≤ ${textNoiseMax} chars)`,
            };
        }
        return {
            verdict: 'FAIL',
            reason: `text mismatch exceeds text_noise_max (${sizeDelta} > ${textNoiseMax} chars)`,
        };
    }

    // Structured diffs: classify per-change by allowlist coverage.
    const allowedSet = new Set(allowlist);
    const allInAllowlist = diff.changes.every((c) => allowedSet.has(toPathString(c.path)));
    if (allInAllowlist) {
        return {
            verdict: 'PASS-WITH-NOISE',
            reason: `all ${diff.changes.length} change(s) inside noise_allowlist`,
        };
    }

    // Mixed: some allowlisted, some not → HUMAN-REVIEW so the operator decides.
    const someInAllowlist = diff.changes.some((c) => allowedSet.has(toPathString(c.path)));
    if (someInAllowlist) {
        return {
            verdict: 'HUMAN-REVIEW',
            reason: 'subset of changes inside noise_allowlist; remainder need review',
        };
    }

    return {
        verdict: 'FAIL',
        reason: `${diff.changes.length} change(s) outside noise_allowlist`,
    };
}

function toPathString(path: readonly (string | number)[]): string {
    if (path.length === 0) return '';
    return `$.${path.map(String).join('.')}`;
}

export function aggregateRunVerdict(
    perScenario: readonly ScenarioClassification[],
    passThreshold = 0.9,
): { verdict: Verdict; coverage_pct: number } {
    if (perScenario.length === 0) {
        return { verdict: 'FAIL', coverage_pct: 0 };
    }

    const counts = { PASS: 0, 'PASS-WITH-NOISE': 0, 'HUMAN-REVIEW': 0, FAIL: 0 } as Record<
        Verdict,
        number
    >;
    for (const c of perScenario) counts[c.verdict] += 1;

    const total = perScenario.length;
    const goodCount = counts['PASS'] + counts['PASS-WITH-NOISE'];
    const coverage = goodCount / total;

    if (counts['FAIL'] > 0) {
        return { verdict: 'FAIL', coverage_pct: round2(coverage) };
    }
    if (coverage >= passThreshold && counts['HUMAN-REVIEW'] === 0) {
        return { verdict: 'PASS', coverage_pct: round2(coverage) };
    }
    if (coverage >= passThreshold) {
        return { verdict: 'HUMAN-REVIEW', coverage_pct: round2(coverage) };
    }
    return { verdict: 'FAIL', coverage_pct: round2(coverage) };
}

function round2(n: number): number {
    return Math.round(n * 10000) / 10000;
}
