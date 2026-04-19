import type { MergedFact, MergedFactInput } from '@atlas/shared';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { emitOpenApi } from '../src/openapi.js';

let nextId = 1;

function merged(input: Partial<MergedFactInput>): MergedFact {
  const base: MergedFactInput = {
    run_id: input.run_id ?? 'r',
    fact_type: input.fact_type ?? 'route',
    content: input.content ?? { method: 'GET', path: '/' },
    resolution: input.resolution ?? 'unanimous',
    source_fact_ids: input.source_fact_ids ?? [1],
    winning_source: input.winning_source === undefined ? 'code-spelunker' : input.winning_source,
    confidence: input.confidence ?? 'high',
  };
  return { ...base, id: nextId++, created_at: '2026-04-18T00:00:00.000Z' };
}

describe('emitOpenApi', () => {
  it('produces a minimal valid spec for an empty fact set', () => {
    const result = emitOpenApi([], { runId: 'r' });
    const parsed = parseYaml(result.yaml) as { openapi: string; paths: Record<string, unknown> };
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.paths).toEqual({});
    expect(result.path_count).toBe(0);
    expect(result.schema_count).toBe(0);
  });

  it('emits one path entry per route fact, grouping methods on the same path', () => {
    const facts = [
      merged({ fact_type: 'route', content: { method: 'GET', path: '/ve/invoice' } }),
      merged({ fact_type: 'route', content: { method: 'POST', path: '/ve/invoice' } }),
      merged({ fact_type: 'route', content: { method: 'GET', path: '/ve/customer' } }),
    ];
    const result = emitOpenApi(facts, { runId: 'r' });
    const parsed = parseYaml(result.yaml) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(parsed.paths).sort()).toEqual(['/ve/customer', '/ve/invoice']);
    expect(Object.keys(parsed.paths['/ve/invoice'] ?? {}).sort()).toEqual(['get', 'post']);
    expect(result.path_count).toBe(2);
  });

  it('includes x-atlas-evidence with source fact ids and winning source', () => {
    const facts = [
      merged({
        fact_type: 'route',
        content: { method: 'POST', path: '/ve/invoice' },
        source_fact_ids: [10, 20],
        winning_source: 'traffic-sniffer',
        resolution: 'priority',
      }),
    ];
    const result = emitOpenApi(facts, { runId: 'r' });
    const parsed = parseYaml(result.yaml) as { paths: Record<string, Record<string, { 'x-atlas-evidence': { source_fact_ids: number[]; winning_source: string } }>> };
    const ev = parsed.paths['/ve/invoice']?.['post']?.['x-atlas-evidence'];
    expect(ev?.source_fact_ids).toEqual([10, 20]);
    expect(ev?.winning_source).toBe('traffic-sniffer');
  });

  it('builds component schemas from field_definition facts with type coercion', () => {
    const facts = [
      merged({ fact_type: 'field_definition', content: { name: 'amount', type: 'decimal', required: true } }),
      merged({ fact_type: 'field_definition', content: { name: 'currency', type: 'string' } }),
      merged({ fact_type: 'field_definition', content: { name: 'quantity', type: 'integer' } }),
    ];
    const result = emitOpenApi(facts, { runId: 'r' });
    const parsed = parseYaml(result.yaml) as { components: { schemas: Record<string, { type: string }> } };
    expect(parsed.components.schemas['amount']?.type).toBe('number');
    expect(parsed.components.schemas['currency']?.type).toBe('string');
    expect(parsed.components.schemas['quantity']?.type).toBe('integer');
    expect(result.schema_count).toBe(3);
  });

  it('seeds responses from observed http_response status codes', () => {
    const facts = [
      merged({ fact_type: 'route', content: { method: 'POST', path: '/ve/invoice' } }),
      merged({
        fact_type: 'http_response',
        content: { method: 'POST', url: '/ve/invoice', status: 302, scenario_id: 's1' },
      }),
      merged({
        fact_type: 'http_response',
        content: { method: 'POST', url: '/ve/invoice', status: 422, scenario_id: 's2' },
      }),
    ];
    const result = emitOpenApi(facts, { runId: 'r' });
    const parsed = parseYaml(result.yaml) as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
    expect(Object.keys(parsed.paths['/ve/invoice']?.['post']?.responses ?? {}).sort()).toEqual(['302', '422']);
  });
});
