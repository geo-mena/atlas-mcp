import type { Verdict } from '@atlas/shared';

import { aggregateRunVerdict, classify, type ClassifyOptions } from './classify.js';
import { runDiff, type DiffResult } from './diff.js';
import { normalize, type NormalizationConfig } from './normalize.js';

export interface ScenarioInput {
  readonly scenario_id: string;
  readonly request: { readonly method: string; readonly url: string };
  readonly legacy_response: ResponseBody;
  readonly candidate_response: ResponseBody;
}

export interface ResponseBody {
  readonly status: number;
  readonly content_type: string;
  readonly body: string;
}

export interface ScenarioResult {
  readonly scenario_id: string;
  readonly request: { readonly method: string; readonly url: string };
  readonly verdict: Verdict;
  readonly reason: string;
  readonly diff: DiffResult;
  readonly status_match: boolean;
}

export interface AuditResult {
  readonly run_id: string;
  readonly run_verdict: Verdict;
  readonly coverage_pct: number;
  readonly scenarios: readonly ScenarioResult[];
  readonly counts: Readonly<Record<Verdict, number>>;
}

export interface AuditOptions {
  readonly run_id: string;
  readonly normalization?: NormalizationConfig;
  readonly classify?: ClassifyOptions;
  readonly pass_threshold?: number;
}

/**
 * auditScenarios — pure, deterministic. Take pre-paired (legacy, candidate)
 * responses and emit per-scenario verdicts plus a run-level aggregate.
 *
 * Status code mismatch always classifies the scenario as FAIL, regardless of
 * the body diff outcome.
 */
export function auditScenarios(scenarios: readonly ScenarioInput[], options: AuditOptions): AuditResult {
  const results: ScenarioResult[] = [];
  const counts: Record<Verdict, number> = { PASS: 0, 'PASS-WITH-NOISE': 0, 'HUMAN-REVIEW': 0, FAIL: 0 };

  for (const scenario of scenarios) {
    const result = auditOne(scenario, options);
    results.push(result);
    counts[result.verdict] += 1;
  }

  const aggregate = aggregateRunVerdict(
    results.map((r) => ({ verdict: r.verdict, reason: r.reason })),
    options.pass_threshold ?? 0.9,
  );

  return {
    run_id: options.run_id,
    run_verdict: aggregate.verdict,
    coverage_pct: aggregate.coverage_pct,
    scenarios: results,
    counts,
  };
}

function auditOne(scenario: ScenarioInput, options: AuditOptions): ScenarioResult {
  const legacy = scenario.legacy_response;
  const candidate = scenario.candidate_response;

  const statusMatch = legacy.status === candidate.status;
  if (!statusMatch) {
    return {
      scenario_id: scenario.scenario_id,
      request: scenario.request,
      verdict: 'FAIL',
      reason: `status mismatch: legacy=${legacy.status}, candidate=${candidate.status}`,
      status_match: false,
      diff: {
        equal: false,
        content_type: legacy.content_type,
        changes: [
          { type: 'CHANGE', path: ['status'], old: legacy.status, new: candidate.status },
        ],
        summary: 'status mismatch',
      },
    };
  }

  const normalizationConfig = options.normalization ?? {};
  const normalizedLegacy = normalize(legacy.body, legacy.content_type, normalizationConfig);
  const normalizedCandidate = normalize(candidate.body, candidate.content_type, normalizationConfig);
  const diffResult = runDiff(normalizedLegacy, normalizedCandidate);
  const classification = classify(diffResult, options.classify ?? {});

  return {
    scenario_id: scenario.scenario_id,
    request: scenario.request,
    verdict: classification.verdict,
    reason: classification.reason,
    status_match: true,
    diff: diffResult,
  };
}
