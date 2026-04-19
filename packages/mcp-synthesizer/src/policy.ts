import type { Confidence, Fact, MergedFactInput, Resolution, SourceAgent } from '@atlas/shared';

/**
 * Source priority ranking. Higher number = higher trust.
 *
 * Rationale:
 *   - traffic-sniffer (4): runtime evidence — what the system actually does.
 *   - code-spelunker (3): static evidence — what the code claims to do.
 *   - ui-explorer  (2): observed UI surface — narrower than runtime traffic.
 *   - doc-harvester (1): tribal / normative — most prone to drift.
 *
 * When two sources disagree on the same logical fact, the higher-priority
 * source wins. This is the project's governing assumption per
 * [[07 — Risk Matrix#Technical|T2]] mitigation.
 */
const SOURCE_PRIORITY: Record<SourceAgent, number> = {
  'traffic-sniffer': 4,
  'code-spelunker': 3,
  'ui-explorer': 2,
  'doc-harvester': 1,
};

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * logicalKey — a deterministic identity for a fact across sources.
 *
 * Two facts share a logicalKey iff they refer to the same legacy artifact
 * (same route, same field, same business rule). The Synthesizer groups
 * facts by this key and then resolves disagreements within each group.
 */
export function logicalKey(fact: Fact): string {
  const c = fact.content;
  switch (fact.fact_type) {
    case 'route':
      return `route:${str(c, 'method').toUpperCase()} ${str(c, 'path').toLowerCase()}`;
    case 'controller_action':
      return `controller_action:${str(c, 'class')}@${str(c, 'method')}`;
    case 'db_query':
      return `db_query:${str(c, 'operation').toUpperCase()}:${str(c, 'table')}:${str(c, 'controller')}`;
    case 'external_call':
      return `external_call:${str(c, 'method').toUpperCase()} ${str(c, 'url_template').toLowerCase()}`;
    case 'ui_screen':
      return `ui_screen:${str(c, 'url').toLowerCase()}`;
    case 'ui_field':
      return `ui_field:${str(c, 'screen').toLowerCase()}#${str(c, 'name')}`;
    case 'ui_validation':
      return `ui_validation:${str(c, 'screen').toLowerCase()}#${str(c, 'field')}#${str(c, 'trigger')}`;
    case 'ui_transition':
      return `ui_transition:${str(c, 'from')}->${str(c, 'trigger')}->${str(c, 'to')}`;
    case 'http_request':
      return `http_request:${str(c, 'scenario_id')}:${str(c, 'method').toUpperCase()} ${str(c, 'url').toLowerCase()}`;
    case 'http_response':
      return `http_response:${str(c, 'scenario_id')}:${str(c, 'status')}`;
    case 'auth_artifact':
      return `auth_artifact:${str(c, 'type')}:${str(c, 'name')}`;
    case 'payload_field':
      return `payload_field:${str(c, 'endpoint')}#${str(c, 'field')}`;
    case 'business_rule':
      return `business_rule:${str(c, 'scope')}:${normalize(str(c, 'statement'))}`;
    case 'compliance_constraint':
      return `compliance_constraint:${str(c, 'regulator')}:${normalize(str(c, 'requirement'))}`;
    case 'field_definition':
      return `field_definition:${str(c, 'name')}`;
    case 'partial_progress':
      // Partial-progress facts never compete; key by source + id so each is its own group.
      return `partial_progress:${fact.source_agent}:${String(fact.id)}`;
    default:
      return `unknown:${fact.fact_type}:${String(fact.id)}`;
  }
}

export function groupByKey(facts: readonly Fact[]): Map<string, Fact[]> {
  const groups = new Map<string, Fact[]>();
  for (const fact of facts) {
    const key = logicalKey(fact);
    const existing = groups.get(key);
    if (existing) {
      existing.push(fact);
    } else {
      groups.set(key, [fact]);
    }
  }
  return groups;
}

/**
 * resolveGroup — pick a winner among facts that share a logicalKey.
 *
 * Decision tree:
 *   1. All contents deep-equal      → unanimous (winning_source = first.source_agent)
 *   2. Source priorities differ      → priority (highest priority wins)
 *   3. Same priority, recency differs → recency (newest created_at wins)
 *   4. Same priority + recency, confidence differs → confidence (highest confidence wins)
 *   5. Otherwise                     → unresolved (no definite winner; flagged for review)
 */
export function resolveGroup(facts: readonly Fact[]): MergedFactInput {
  const first = facts.at(0);
  if (first === undefined) {
    throw new Error('cannot resolve empty group');
  }

  if (allContentsEqual(facts)) {
    return {
      run_id: first.run_id,
      fact_type: first.fact_type,
      content: first.content,
      resolution: 'unanimous',
      source_fact_ids: facts.map((f) => f.id),
      winning_source: first.source_agent,
      confidence: highestConfidence(facts),
    };
  }

  const sorted = sortByPolicy(facts);
  const winner = sorted[0];
  const runnerUp = sorted[1];
  if (winner === undefined || runnerUp === undefined) {
    // Single fact in group, but contents disagreed across iterations? Defensive — treat as unanimous.
    return {
      run_id: first.run_id,
      fact_type: first.fact_type,
      content: first.content,
      resolution: 'unanimous',
      source_fact_ids: facts.map((f) => f.id),
      winning_source: first.source_agent,
      confidence: first.confidence,
    };
  }

  const resolution = decideResolution(winner, runnerUp);
  const losers = sorted.slice(1);

  return {
    run_id: winner.run_id,
    fact_type: winner.fact_type,
    content: winner.content,
    resolution,
    source_fact_ids: facts.map((f) => f.id),
    winning_source: winner.source_agent,
    confidence: winner.confidence,
    conflicts: losers.map((f) => f.id),
  };
}

export function synthesizeDrafts(facts: readonly Fact[]): MergedFactInput[] {
  const drafts: MergedFactInput[] = [];
  for (const group of groupByKey(facts).values()) {
    drafts.push(resolveGroup(group));
  }
  return drafts;
}

function sortByPolicy(facts: readonly Fact[]): Fact[] {
  return [...facts].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source_agent];
    const pb = SOURCE_PRIORITY[b.source_agent];
    if (pa !== pb) return pb - pa;

    const ta = parseTimestamp(a.created_at);
    const tb = parseTimestamp(b.created_at);
    if (ta !== tb) return tb - ta;

    return CONFIDENCE_WEIGHT[b.confidence] - CONFIDENCE_WEIGHT[a.confidence];
  });
}

function decideResolution(winner: Fact, runnerUp: Fact): Resolution {
  if (SOURCE_PRIORITY[winner.source_agent] !== SOURCE_PRIORITY[runnerUp.source_agent]) {
    return 'priority';
  }
  if (parseTimestamp(winner.created_at) !== parseTimestamp(runnerUp.created_at)) {
    return 'recency';
  }
  if (CONFIDENCE_WEIGHT[winner.confidence] !== CONFIDENCE_WEIGHT[runnerUp.confidence]) {
    return 'confidence';
  }
  return 'unresolved';
}

function allContentsEqual(facts: readonly Fact[]): boolean {
  const first = facts.at(0);
  if (first === undefined) return true;
  const reference = JSON.stringify(first.content);
  for (let i = 1; i < facts.length; i++) {
    const next = facts[i];
    if (next === undefined) continue;
    if (JSON.stringify(next.content) !== reference) return false;
  }
  return true;
}

function highestConfidence(facts: readonly Fact[]): Confidence {
  let best: Confidence = 'low';
  for (const fact of facts) {
    if (CONFIDENCE_WEIGHT[fact.confidence] > CONFIDENCE_WEIGHT[best]) {
      best = fact.confidence;
    }
  }
  return best;
}

function parseTimestamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function str(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
