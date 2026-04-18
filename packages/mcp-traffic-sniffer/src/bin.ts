#!/usr/bin/env node
import { resolve } from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ProxyRegistry } from './registry.js';
import { buildServer } from './server.js';

const DEFAULT_BASE_PORT = 8888;

async function main(): Promise<void> {
  const registry = new ProxyRegistry();
  const runsRoot = resolve(process.env['ATLAS_RUNS_ROOT'] ?? resolve(process.cwd(), '.atlas', 'runs'));

  const basePort = Number.parseInt(process.env['ATLAS_PROXY_BASE_PORT'] ?? String(DEFAULT_BASE_PORT), 10);
  const allocator = sequentialPortAllocator(basePort);

  const server = buildServer(registry, {
    runsRoot,
    portAllocator: allocator,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = (): void => {
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function sequentialPortAllocator(base: number): () => number {
  let next = base;
  return () => {
    const port = next;
    next += 1;
    return port;
  };
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`atlas-traffic-sniffer fatal: ${message}\n`);
  process.exit(1);
});
