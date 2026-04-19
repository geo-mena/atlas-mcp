#!/usr/bin/env tsx
/**
 * Atlas smoke test — deterministic end-to-end sanity. No LLM, no Claude
 * Code, no MCP transport. Imports packages directly, exercises persistence
 * + traffic-sniffer plumbing, and asserts roundtrip behavior.
 *
 * Day 1: scratchpad write_fact + read_facts roundtrip.
 * Day 2: traffic-sniffer Proxy state transitions (with fake spawner) + HAR
 *        parsing on a sample document.
 */

import type { ChildProcess } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Scratchpad, readFacts, writeFact } from '@atlas/mcp-scratchpad';
import { synthesize } from '@atlas/mcp-synthesizer';
import { Proxy, parseHar, summarizeHar, type Spawner } from '@atlas/mcp-traffic-sniffer';

function main(): void {
  smokeScratchpad();
  smokeTrafficSniffer();
  smokeSynthesizer();
  smokeAgentValidator();
  process.stdout.write('atlas smoke OK (Day 4: scratchpad + traffic-sniffer + synthesizer + agent validator)\n');
}

function smokeScratchpad(): void {
  const tmp = mkdtempSync(join(tmpdir(), 'atlas-smoke-scratchpad-'));
  const scratchpad = new Scratchpad(join(tmp, 'smoke.sqlite'));

  try {
    scratchpad.migrate();

    const { id } = writeFact(scratchpad, {
      run_id: 'smoke',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'file:///legacy/sandbox/index.php#L42',
      confidence: 'high',
    });
    assert.ok(id > 0, 'expected a positive fact id');

    const facts = readFacts(scratchpad, { run_id: 'smoke' });
    assert.equal(facts.length, 1, 'expected exactly one fact');
    const [fact] = facts;
    assert.ok(fact, 'expected a fact');
    assert.equal(fact.id, id);
    assert.deepEqual(fact.content, { method: 'POST', path: '/ve/invoice' });
    assert.equal(fact.confidence, 'high');
  } finally {
    scratchpad.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

function smokeTrafficSniffer(): void {
  // Verify Proxy state transitions with a fake spawner; we never actually
  // exec mitmproxy here so the smoke runs in any environment.
  const spawnCalls: string[][] = [];
  const fakeSpawner: Spawner = (command, args) => {
    spawnCalls.push([command, ...args]);
    const ee = new EventEmitter() as ChildProcess & { kill: (signal?: string) => boolean };
    ee.kill = () => true;
    return ee;
  };

  const proxy = new Proxy(
    { runId: 'smoke', listenPort: 8888, harPath: '/tmp/atlas-smoke.har' },
    fakeSpawner,
  );
  proxy.start();
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0]?.[0], 'mitmdump');
  assert.ok(spawnCalls[0]?.includes('--listen-port'));
  assert.ok(spawnCalls[0]?.includes('hardump=/tmp/atlas-smoke.har'));
  assert.equal(proxy.isRunning(), true);

  proxy.stop();
  assert.equal(proxy.isRunning(), false);

  // Verify HAR parsing on a small synthetic document.
  const sample = JSON.stringify({
    log: {
      version: '1.2',
      entries: [
        {
          startedDateTime: '2026-04-18T22:08:29.000Z',
          time: 12,
          request: { method: 'POST', url: 'http://seniat/authorize', httpVersion: 'HTTP/1.1', headers: [] },
          response: {
            status: 200,
            statusText: 'OK',
            httpVersion: 'HTTP/1.1',
            headers: [],
            content: { size: 0, mimeType: 'application/xml' },
          },
        },
      ],
    },
  });
  const har = parseHar(sample);
  const summary = summarizeHar(har.log.entries);
  assert.equal(summary.count, 1);
  assert.equal(summary.methods['POST'], 1);
}

function smokeSynthesizer(): void {
  const tmp = mkdtempSync(join(tmpdir(), 'atlas-smoke-synth-'));
  const scratchpad = new Scratchpad(join(tmp, 'smoke.sqlite'));

  try {
    scratchpad.migrate();

    // Two unanimous source-agent facts about the same route → 1 merged_fact, unanimous.
    writeFact(scratchpad, {
      run_id: 'synth-smoke',
      source_agent: 'code-spelunker',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'file:///legacy/index.php#L42',
      confidence: 'high',
    });
    writeFact(scratchpad, {
      run_id: 'synth-smoke',
      source_agent: 'traffic-sniffer',
      fact_type: 'route',
      content: { method: 'POST', path: '/ve/invoice' },
      evidence_uri: 'har://golden#0',
      confidence: 'high',
    });

    // Cross-source disagreement on field type → 1 merged_fact, priority (traffic wins).
    writeFact(scratchpad, {
      run_id: 'synth-smoke',
      source_agent: 'code-spelunker',
      fact_type: 'field_definition',
      content: { name: 'amount', type: 'integer' },
      evidence_uri: 'file:///legacy/Models/Invoice.php#L8',
      confidence: 'high',
    });
    writeFact(scratchpad, {
      run_id: 'synth-smoke',
      source_agent: 'traffic-sniffer',
      fact_type: 'field_definition',
      content: { name: 'amount', type: 'decimal' },
      evidence_uri: 'har://golden#1',
      confidence: 'high',
    });

    const result = synthesize(scratchpad, 'synth-smoke');
    assert.equal(result.source_fact_count, 4);
    assert.equal(result.merged_count, 2);
    assert.equal(result.resolutions['unanimous'], 1);
    assert.equal(result.resolutions['priority'], 1);
    assert.equal(result.unresolved_count, 0);

    // Idempotency check.
    const second = synthesize(scratchpad, 'synth-smoke');
    assert.equal(second.merged_count, 2, 'expected idempotent re-synthesis');
  } finally {
    scratchpad.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

function smokeAgentValidator(): void {
  // Run validate-agents.ts as a subprocess; assert it exits 0 and prints OK.
  const validatorPath = resolve(process.cwd(), 'scripts', 'validate-agents.ts');
  const result = spawnSync('npx', ['tsx', validatorPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `validator exited ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /atlas validate-agents: OK/, `unexpected stdout: ${result.stdout}`);
}

main();
