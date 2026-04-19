import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MergedFact, MergedFactInput } from '@atlas/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emitMcpServer } from '../src/mcp-server.js';

let nextId = 1;
function merged(input: Partial<MergedFactInput>): MergedFact {
    const base: MergedFactInput = {
        run_id: input.run_id ?? 'r',
        fact_type: input.fact_type ?? 'route',
        content: input.content ?? { method: 'GET', path: '/' },
        resolution: input.resolution ?? 'unanimous',
        source_fact_ids: input.source_fact_ids ?? [1],
        winning_source:
            input.winning_source === undefined ? 'code-spelunker' : input.winning_source,
        confidence: input.confidence ?? 'high',
    };
    return { ...base, id: nextId++, created_at: '2026-04-18T00:00:00.000Z' };
}

describe('emitMcpServer', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), 'atlas-genmcp-'));
    });

    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    it('writes package.json, tsconfig.json, README, and src/index.ts', () => {
        const result = emitMcpServer(
            [merged({ fact_type: 'route', content: { method: 'POST', path: '/ve/invoice' } })],
            { runId: 'r', outDir: tmp },
        );
        expect(result.tool_count).toBe(1);
        expect(result.files_written.sort()).toEqual([
            'README.md',
            'package.json',
            'src/index.ts',
            'tsconfig.json',
        ]);
    });

    it('produces one tool per route with method+path slug naming', () => {
        const facts = [
            merged({ fact_type: 'route', content: { method: 'POST', path: '/ve/invoice' } }),
            merged({ fact_type: 'route', content: { method: 'GET', path: '/ve/invoice/{id}' } }),
        ];
        emitMcpServer(facts, { runId: 'r', outDir: tmp });
        const source = readFileSync(join(tmp, 'src/index.ts'), 'utf8');
        expect(source).toContain('"name": "post_ve_invoice"');
        expect(source).toContain('"name": "get_ve_invoice_id"');
    });

    it('embeds x-atlas-evidence on each tool', () => {
        const facts = [
            merged({
                fact_type: 'route',
                content: { method: 'POST', path: '/ve/invoice' },
                source_fact_ids: [7, 8],
                resolution: 'priority',
            }),
        ];
        emitMcpServer(facts, { runId: 'r', outDir: tmp });
        const source = readFileSync(join(tmp, 'src/index.ts'), 'utf8');
        expect(source).toContain('"source_fact_ids": [');
        expect(source).toContain('"resolution": "priority"');
    });
});
