#!/usr/bin/env tsx
/**
 * Atlas smoke test — deterministic end-to-end sanity for mcp-scratchpad.
 *
 * No LLM, no Claude Code, no MCP transport. Imports the package directly,
 * exercises the persistence layer, and asserts the roundtrip is byte-equal.
 *
 * Day 1: scratchpad write_fact + read_facts.
 * Day 4 will extend: invoke synthesizer.synthesize on a known fact set.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Scratchpad, readFacts, writeFact } from '@atlas/mcp-scratchpad';

function main(): void {
  const tmp = mkdtempSync(join(tmpdir(), 'atlas-smoke-'));
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

    process.stdout.write('atlas smoke OK (Day 1: scratchpad roundtrip)\n');
  } finally {
    scratchpad.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
