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
import { EventEmitter } from 'node:events';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Scratchpad, readFacts, writeFact } from '@atlas/mcp-scratchpad';
import { Proxy, parseHar, summarizeHar, type Spawner } from '@atlas/mcp-traffic-sniffer';

function main(): void {
  smokeScratchpad();
  smokeTrafficSniffer();
  process.stdout.write('atlas smoke OK (Day 2: scratchpad + traffic-sniffer)\n');
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

main();
