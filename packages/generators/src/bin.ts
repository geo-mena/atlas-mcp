#!/usr/bin/env node
import { resolve } from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { buildServer } from './server.js';

async function main(): Promise<void> {
  const scratchpadPath = resolveScratchpadPath();
  const runsRoot = resolve(process.env['ATLAS_RUNS_ROOT'] ?? resolve(process.cwd(), '.atlas', 'runs'));

  const server = buildServer({ scratchpadPath, runsRoot });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = (): void => {
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function resolveScratchpadPath(): string {
  const fromEnv = process.env['ATLAS_SCRATCHPAD_PATH'];
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
  const runId = process.env['ATLAS_RUN_ID'] ?? 'default';
  return resolve(process.cwd(), '.atlas', 'runs', runId, 'scratchpad.sqlite');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`atlas-generators fatal: ${message}\n`);
  process.exit(1);
});
