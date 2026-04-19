#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { Scratchpad } from './db.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
    const dbPath = resolveDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });

    const scratchpad = new Scratchpad(dbPath);
    scratchpad.migrate();

    const server = buildServer(scratchpad);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const shutdown = (): void => {
        scratchpad.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

function resolveDbPath(): string {
    const fromEnv = process.env['ATLAS_SCRATCHPAD_PATH'];
    if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
    // Default per Q23: per-project run directory.
    const runId = process.env['ATLAS_RUN_ID'] ?? 'default';
    return resolve(process.cwd(), '.atlas', 'runs', runId, 'scratchpad.sqlite');
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`atlas-scratchpad fatal: ${message}\n`);
    process.exit(1);
});
