import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Scratchpad } from '../src/db.js';

describe('Scratchpad (SQLite)', () => {
  let tmp: string;
  let scratchpad: Scratchpad;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'atlas-scratchpad-'));
    scratchpad = new Scratchpad(join(tmp, 'test.sqlite'));
    scratchpad.migrate();
  });

  afterEach(() => {
    scratchpad.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('migrate is idempotent', () => {
    scratchpad.migrate();
    scratchpad.migrate();
    expect(scratchpad.countFacts('any')).toBe(0);
  });

  it('roundtrips a single fact', () => {
    const id = scratchpad.insertFact({
      run_id: 'run-1',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'file:///legacy/index.php#L42',
      confidence: 'high',
    });
    expect(id).toBeGreaterThan(0);

    const facts = scratchpad.selectFacts({ run_id: 'run-1' });
    expect(facts).toHaveLength(1);
    const [fact] = facts;
    expect(fact?.id).toBe(id);
    expect(fact?.content).toEqual({ method: 'POST', path: '/ve/invoice' });
    expect(fact?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('filters by source_agent', () => {
    scratchpad.insertFact({
      run_id: 'run-2',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: {},
      evidence_uri: 'file://a',
      confidence: 'high',
    });
    scratchpad.insertFact({
      run_id: 'run-2',
      source_agent: 'ui-explorer',
      fact_type: 'ui_screen',
      content: {},
      evidence_uri: 'file://b',
      confidence: 'high',
    });

    const code = scratchpad.selectFacts({ run_id: 'run-2', source_agent: 'code-spelunker' });
    const ui = scratchpad.selectFacts({ run_id: 'run-2', source_agent: 'ui-explorer' });
    expect(code).toHaveLength(1);
    expect(ui).toHaveLength(1);
    expect(code[0]?.fact_type).toBe('route');
    expect(ui[0]?.fact_type).toBe('ui_screen');
  });

  it('filters by fact_type', () => {
    scratchpad.insertFact({
      run_id: 'run-3',
      source_agent: 'traffic-sniffer',
      fact_type: 'http_request',
      content: {},
      evidence_uri: 'har://0',
      confidence: 'medium',
    });
    scratchpad.insertFact({
      run_id: 'run-3',
      source_agent: 'traffic-sniffer',
      fact_type: 'http_response',
      content: {},
      evidence_uri: 'har://0',
      confidence: 'medium',
    });

    const reqs = scratchpad.selectFacts({ run_id: 'run-3', fact_type: 'http_request' });
    expect(reqs).toHaveLength(1);
  });

  it('preserves conflicts_with when present, omits when absent', () => {
    const a = scratchpad.insertFact({
      run_id: 'run-4',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: {},
      evidence_uri: 'file://a',
      confidence: 'high',
    });
    scratchpad.insertFact({
      run_id: 'run-4',
      source_agent: 'ui-explorer',
      fact_type: 'route',
      content: {},
      evidence_uri: 'file://b',
      confidence: 'low',
      conflicts_with: [a],
    });

    const facts = scratchpad.selectFacts({ run_id: 'run-4' });
    expect(facts[0]?.conflicts_with).toBeUndefined();
    expect(facts[1]?.conflicts_with).toEqual([a]);
  });
});
