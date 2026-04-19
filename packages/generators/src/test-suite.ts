import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MergedFact } from '@atlas/shared';

export interface TestSuiteOptions {
  readonly runId: string;
  readonly outDir: string;
}

export interface TestSuiteResult {
  readonly out_dir: string;
  readonly scenario_count: number;
  readonly files_written: readonly string[];
}

interface Scenario {
  readonly id: string;
  readonly request: { method: string; url: string; headers: Record<string, string>; body?: string };
  readonly response: { status: number; body?: string };
}

/**
 * emitTestSuite — write a Vitest + nock test scaffold derived from
 * merged_facts. One vitest case per `http_request`/`http_response` pair
 * sharing a `scenario_id`.
 *
 * Day 5 v0.1: replay-only tests assert that the generated MCP server
 * matches the captured legacy responses. The Fidelity Auditor (Day 6+)
 * is the deeper byte-level diff; this suite is the developer-facing
 * regression net.
 */
export function emitTestSuite(facts: readonly MergedFact[], options: TestSuiteOptions): TestSuiteResult {
  const scenarios = pairScenarios(facts);

  mkdirSync(join(options.outDir, 'tests'), { recursive: true });
  const written: string[] = [];

  written.push(write(options.outDir, 'package.json', renderPackageJson(options.runId)));
  written.push(write(options.outDir, 'vitest.config.ts', renderVitestConfig()));
  written.push(write(options.outDir, 'tests/replay.test.ts', renderReplayTest(options.runId, scenarios)));

  return { out_dir: options.outDir, scenario_count: scenarios.length, files_written: written };
}

function pairScenarios(facts: readonly MergedFact[]): Scenario[] {
  const requests = facts.filter((f) => f.fact_type === 'http_request');
  const responses = facts.filter((f) => f.fact_type === 'http_response');

  const responsesByScenario = new Map<string, MergedFact>();
  for (const r of responses) {
    const id = String(r.content['scenario_id'] ?? '');
    if (id !== '') responsesByScenario.set(id, r);
  }

  const scenarios: Scenario[] = [];
  for (const req of requests) {
    const id = String(req.content['scenario_id'] ?? '');
    const matched = responsesByScenario.get(id);
    if (id === '' || !matched) continue;

    const request: Scenario['request'] = {
      method: String(req.content['method'] ?? 'GET').toUpperCase(),
      url: String(req.content['url'] ?? ''),
      headers: asHeaders(req.content['headers']),
    };
    if (req.content['body_excerpt'] !== undefined) {
      request.body = String(req.content['body_excerpt']);
    }

    const response: Scenario['response'] = {
      status: Number(matched.content['status'] ?? 200),
    };
    if (matched.content['body_excerpt'] !== undefined) {
      response.body = String(matched.content['body_excerpt']);
    }

    scenarios.push({ id, request, response });
  }
  return scenarios;
}

function asHeaders(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = String(v);
  }
  return out;
}

function write(outDir: string, relPath: string, content: string): string {
  const fullPath = join(outDir, relPath);
  mkdirSync(join(outDir, relPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
  return relPath;
}

function renderPackageJson(runId: string): string {
  return `${JSON.stringify(
    {
      name: `atlas-generated-tests-${runId}`,
      version: '0.1.0-alpha.0',
      private: true,
      type: 'module',
      scripts: { test: 'vitest run' },
      devDependencies: {
        nock: '^13.5.5',
        vitest: '^2.1.0',
      },
    },
    null,
    2,
  )}\n`;
}

function renderVitestConfig(): string {
  return `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({\n  test: { reporters: ['default'] },\n});\n`;
}

function renderReplayTest(runId: string, scenarios: readonly Scenario[]): string {
  if (scenarios.length === 0) {
    return `import { describe, it } from 'vitest';\n\ndescribe('atlas-generated replay (run ${runId})', () => {\n  it.todo('no http_request/http_response scenarios were captured for this run');\n});\n`;
  }
  const cases = scenarios
    .map((s) => `  it('replays scenario ${s.id}', async () => {\n` +
      `    const url = new URL(${JSON.stringify(s.request.url)});\n` +
      `    nock(url.origin).intercept(url.pathname + url.search, ${JSON.stringify(s.request.method)}).reply(${s.response.status}${s.response.body !== undefined ? `, ${JSON.stringify(s.response.body)}` : ''});\n` +
      `    const res = await fetch(${JSON.stringify(s.request.url)}, { method: ${JSON.stringify(s.request.method)} });\n` +
      `    expect(res.status).toBe(${s.response.status});\n` +
      `  });\n`)
    .join('\n');
  return `import { describe, expect, it } from 'vitest';\nimport nock from 'nock';\n\ndescribe('atlas-generated replay (run ${runId})', () => {\n${cases}});\n`;
}
