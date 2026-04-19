import type { Fact, FactInput, SourceAgent } from '@atlas/shared';
import { describe, expect, it } from 'vitest';

import { groupByKey, logicalKey, resolveGroup, synthesizeDrafts } from '../src/policy.js';

let nextId = 1;
let nextSecond = 0;

function fact(input: Partial<FactInput> & { id?: number; created_at?: string }): Fact {
  const base: FactInput = {
    run_id: input.run_id ?? 'run-1',
    source_agent: input.source_agent ?? 'code-spelunker',
    fact_type: input.fact_type ?? 'route',
    content: input.content ?? { method: 'GET', path: '/' },
    evidence_uri: input.evidence_uri ?? 'file:///x',
    confidence: input.confidence ?? 'high',
  };
  return {
    ...base,
    id: input.id ?? nextId++,
    created_at: input.created_at ?? nextTimestamp(),
  };
}

function nextTimestamp(): string {
  // Each generated fact gets a strictly-later timestamp so recency tests are
  // deterministic without sleeping in the suite.
  nextSecond += 1;
  return new Date(Date.UTC(2026, 3, 18, 0, 0, nextSecond)).toISOString();
}

describe('logicalKey', () => {
  it('normalizes route method case and path case', () => {
    const a = fact({ fact_type: 'route', content: { method: 'get', path: '/Ve/Invoice' } });
    const b = fact({ fact_type: 'route', content: { method: 'GET', path: '/ve/invoice' } });
    expect(logicalKey(a)).toBe(logicalKey(b));
  });

  it('keys ui_field by screen + name', () => {
    const a = fact({ fact_type: 'ui_field', content: { screen: '/ve/invoice', name: 'customer_id' } });
    expect(logicalKey(a)).toBe('ui_field:/ve/invoice#customer_id');
  });

  it('keys business_rule by scope + normalized statement', () => {
    const a = fact({
      fact_type: 'business_rule',
      content: { scope: 'invoicing', statement: '  Control numbers   MUST be unique  ' },
    });
    const b = fact({
      fact_type: 'business_rule',
      content: { scope: 'invoicing', statement: 'control numbers must be unique' },
    });
    expect(logicalKey(a)).toBe(logicalKey(b));
  });

  it('keys partial_progress per source + id (never collides)', () => {
    const a = fact({ fact_type: 'partial_progress', source_agent: 'code-spelunker', id: 1 });
    const b = fact({ fact_type: 'partial_progress', source_agent: 'code-spelunker', id: 2 });
    expect(logicalKey(a)).not.toBe(logicalKey(b));
  });
});

describe('groupByKey', () => {
  it('groups same-key facts together', () => {
    const a = fact({ fact_type: 'route', content: { method: 'GET', path: '/x' } });
    const b = fact({ fact_type: 'route', content: { method: 'GET', path: '/x' } });
    const c = fact({ fact_type: 'route', content: { method: 'POST', path: '/x' } });

    const groups = groupByKey([a, b, c]);
    expect(groups.size).toBe(2);
    const getGroup = groups.get(logicalKey(a));
    expect(getGroup).toHaveLength(2);
    expect(groups.get(logicalKey(c))).toHaveLength(1);
  });
});

describe('resolveGroup — unanimous', () => {
  it('returns unanimous when contents are deep-equal', () => {
    const a = fact({ source_agent: 'code-spelunker', content: { method: 'POST', path: '/x' } });
    const b = fact({ source_agent: 'traffic-sniffer', content: { method: 'POST', path: '/x' } });
    const merged = resolveGroup([a, b]);
    expect(merged.resolution).toBe('unanimous');
    expect(merged.source_fact_ids).toEqual([a.id, b.id]);
    expect(merged.conflicts).toBeUndefined();
  });
});

describe('resolveGroup — priority', () => {
  it('traffic-sniffer beats code-spelunker on disagreement', () => {
    const code = fact({
      source_agent: 'code-spelunker',
      content: { method: 'GET', path: '/x' },
    });
    const traffic = fact({
      source_agent: 'traffic-sniffer',
      content: { method: 'POST', path: '/x' },
    });
    const merged = resolveGroup([code, traffic]);
    expect(merged.resolution).toBe('priority');
    expect(merged.winning_source).toBe('traffic-sniffer');
    expect(merged.content).toEqual({ method: 'POST', path: '/x' });
    expect(merged.conflicts).toEqual([code.id]);
  });

  it('doc-harvester loses to ui-explorer', () => {
    const doc = fact({
      source_agent: 'doc-harvester',
      content: { name: 'amount', type: 'integer' },
    });
    const ui = fact({
      source_agent: 'ui-explorer',
      content: { name: 'amount', type: 'decimal' },
    });
    const merged = resolveGroup([doc, ui]);
    expect(merged.resolution).toBe('priority');
    expect(merged.winning_source).toBe('ui-explorer');
  });
});

describe('resolveGroup — recency', () => {
  it('newest fact wins when source priorities are equal', () => {
    const older = fact({
      source_agent: 'code-spelunker',
      content: { method: 'GET', path: '/x' },
      created_at: '2026-04-18T00:00:01.000Z',
    });
    const newer = fact({
      source_agent: 'code-spelunker',
      content: { method: 'POST', path: '/x' },
      created_at: '2026-04-18T00:00:02.000Z',
    });
    const merged = resolveGroup([older, newer]);
    expect(merged.resolution).toBe('recency');
    expect(merged.content).toEqual({ method: 'POST', path: '/x' });
  });
});

describe('resolveGroup — confidence', () => {
  it('higher confidence wins when source + recency are equal', () => {
    const ts = '2026-04-18T00:00:01.000Z';
    const low = fact({
      source_agent: 'code-spelunker',
      content: { method: 'GET', path: '/x' },
      confidence: 'low',
      created_at: ts,
    });
    const high = fact({
      source_agent: 'code-spelunker',
      content: { method: 'POST', path: '/x' },
      confidence: 'high',
      created_at: ts,
    });
    const merged = resolveGroup([low, high]);
    expect(merged.resolution).toBe('confidence');
    expect(merged.content).toEqual({ method: 'POST', path: '/x' });
  });
});

describe('resolveGroup — unresolved', () => {
  it('returns unresolved when source + recency + confidence all match', () => {
    const ts = '2026-04-18T00:00:01.000Z';
    const a = fact({
      source_agent: 'code-spelunker',
      content: { method: 'GET', path: '/x' },
      confidence: 'high',
      created_at: ts,
    });
    const b = fact({
      source_agent: 'code-spelunker',
      content: { method: 'POST', path: '/x' },
      confidence: 'high',
      created_at: ts,
    });
    const merged = resolveGroup([a, b]);
    expect(merged.resolution).toBe('unresolved');
    expect(merged.conflicts).toEqual([b.id]);
  });
});

describe('synthesizeDrafts — end-to-end', () => {
  it('produces one draft per logical key', () => {
    const facts: Fact[] = [
      fact({ fact_type: 'route', content: { method: 'GET', path: '/a' } }),
      fact({ fact_type: 'route', content: { method: 'GET', path: '/a' } }),
      fact({ fact_type: 'route', content: { method: 'POST', path: '/a' } }),
      fact({ fact_type: 'route', content: { method: 'GET', path: '/b' } }),
    ];
    const drafts = synthesizeDrafts(facts);
    expect(drafts).toHaveLength(3); // GET /a, POST /a, GET /b
  });

  it('ranks resolutions reproducibly', () => {
    // Use field_definition (keyed by `name`) so cross-source disagreement on
    // `type` shares a logicalKey and exercises the priority resolver.
    const sources: SourceAgent[] = ['code-spelunker', 'traffic-sniffer'];
    const facts = sources.map((s, i) =>
      fact({
        source_agent: s,
        fact_type: 'field_definition',
        content: { name: 'amount', type: i === 0 ? 'integer' : 'decimal' },
      }),
    );
    const drafts = synthesizeDrafts(facts);
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft?.resolution).toBe('priority');
    expect(draft?.winning_source).toBe('traffic-sniffer');
    expect(draft?.content).toEqual({ name: 'amount', type: 'decimal' });
  });
});
