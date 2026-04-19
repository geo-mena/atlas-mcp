import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Scratchpad } from '@atlas/mcp-scratchpad';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { synthesize } from '../src/synthesize.js';

describe('synthesize (DB-backed)', () => {
  let tmp: string;
  let scratchpad: Scratchpad;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'atlas-synth-'));
    scratchpad = new Scratchpad(join(tmp, 'test.sqlite'));
    scratchpad.migrate();
  });

  afterEach(() => {
    scratchpad.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('produces zero merged_facts on an empty run', () => {
    const result = synthesize(scratchpad, 'empty');
    expect(result.merged_count).toBe(0);
    expect(result.unresolved_count).toBe(0);
    expect(scratchpad.countMergedFacts('empty')).toBe(0);
  });

  it('merges two unanimous facts into one merged_fact', () => {
    scratchpad.insertFact({
      run_id: 'r',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'file:///a',
      confidence: 'high',
    });
    scratchpad.insertFact({
      run_id: 'r',
      source_agent: 'traffic-sniffer',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'file:///b',
      confidence: 'high',
    });

    const result = synthesize(scratchpad, 'r');
    expect(result.source_fact_count).toBe(2);
    expect(result.merged_count).toBe(1);
    expect(result.resolutions['unanimous']).toBe(1);
  });

  it('flags unresolved when source + recency + confidence tie', () => {
    const ts = '2026-04-18T12:00:00.000Z';
    // field_definition is keyed by `name` only, so two facts with the same
    // name but different `type` collide in the same group and exercise the
    // unresolved branch when source+recency+confidence all match.
    scratchpad.insertFact({
      run_id: 'r',
      source_agent: 'code-spelunker',
      fact_type: 'field_definition',
      content: { name: 'amount', type: 'integer' },
      evidence_uri: 'file:///a',
      confidence: 'high',
    });
    scratchpad.insertFact({
      run_id: 'r',
      source_agent: 'code-spelunker',
      fact_type: 'field_definition',
      content: { name: 'amount', type: 'decimal' },
      evidence_uri: 'file:///b',
      confidence: 'high',
    });
    // Pin both rows to the same timestamp so recency cannot break the tie.
    scratchpad['db'].prepare('UPDATE facts SET created_at = ?').run(ts);

    const result = synthesize(scratchpad, 'r');
    expect(result.unresolved_count).toBe(1);
  });

  it('is idempotent: re-running replaces prior merged_facts for the run', () => {
    scratchpad.insertFact({
      run_id: 'r',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/x' },
      evidence_uri: 'file:///a',
      confidence: 'high',
    });

    const first = synthesize(scratchpad, 'r');
    expect(first.merged_count).toBe(1);
    expect(scratchpad.countMergedFacts('r')).toBe(1);

    const second = synthesize(scratchpad, 'r');
    expect(second.merged_count).toBe(1);
    expect(scratchpad.countMergedFacts('r')).toBe(1);
  });

  it('isolates runs', () => {
    scratchpad.insertFact({
      run_id: 'a',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/x' },
      evidence_uri: 'file:///a',
      confidence: 'high',
    });
    scratchpad.insertFact({
      run_id: 'b',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/y' },
      evidence_uri: 'file:///b',
      confidence: 'high',
    });

    synthesize(scratchpad, 'a');
    expect(scratchpad.countMergedFacts('a')).toBe(1);
    expect(scratchpad.countMergedFacts('b')).toBe(0);
  });
});
