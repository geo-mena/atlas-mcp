import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MergedFact, MergedFactInput } from '@atlas/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emitTestSuite } from '../src/test-suite.js';

let nextId = 1;
function merged(input: Partial<MergedFactInput>): MergedFact {
  const base: MergedFactInput = {
    run_id: input.run_id ?? 'r',
    fact_type: input.fact_type ?? 'http_request',
    content: input.content ?? {},
    resolution: input.resolution ?? 'unanimous',
    source_fact_ids: input.source_fact_ids ?? [1],
    winning_source: input.winning_source === undefined ? 'traffic-sniffer' : input.winning_source,
    confidence: input.confidence ?? 'high',
  };
  return { ...base, id: nextId++, created_at: '2026-04-18T00:00:00.000Z' };
}

describe('emitTestSuite', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'atlas-gentests-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes package.json, vitest.config.ts, and tests/replay.test.ts', () => {
    const result = emitTestSuite(
      [
        merged({ fact_type: 'http_request', content: { scenario_id: 's1', method: 'POST', url: 'http://x/y' } }),
        merged({ fact_type: 'http_response', content: { scenario_id: 's1', status: 200 } }),
      ],
      { runId: 'r', outDir: tmp },
    );
    expect(result.scenario_count).toBe(1);
    expect(result.files_written.sort()).toEqual([
      'package.json',
      'tests/replay.test.ts',
      'vitest.config.ts',
    ]);
  });

  it('emits a TODO test when no scenarios are present', () => {
    emitTestSuite([], { runId: 'r', outDir: tmp });
    const test = readFileSync(join(tmp, 'tests/replay.test.ts'), 'utf8');
    expect(test).toContain('it.todo');
    expect(test).toContain('no http_request/http_response scenarios');
  });

  it('emits one vitest case per paired scenario', () => {
    emitTestSuite(
      [
        merged({ fact_type: 'http_request', content: { scenario_id: 'a', method: 'GET', url: 'http://x/a' } }),
        merged({ fact_type: 'http_response', content: { scenario_id: 'a', status: 200 } }),
        merged({ fact_type: 'http_request', content: { scenario_id: 'b', method: 'POST', url: 'http://x/b' } }),
        merged({ fact_type: 'http_response', content: { scenario_id: 'b', status: 422 } }),
      ],
      { runId: 'r', outDir: tmp },
    );
    const test = readFileSync(join(tmp, 'tests/replay.test.ts'), 'utf8');
    expect(test).toContain("replays scenario a");
    expect(test).toContain("replays scenario b");
    expect(test).toContain('toBe(422)');
  });

  it('drops orphaned requests with no matching response', () => {
    const result = emitTestSuite(
      [
        merged({ fact_type: 'http_request', content: { scenario_id: 'orphan', method: 'GET', url: 'http://x' } }),
      ],
      { runId: 'r', outDir: tmp },
    );
    expect(result.scenario_count).toBe(0);
  });
});
