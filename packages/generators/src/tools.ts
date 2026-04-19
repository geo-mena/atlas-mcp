import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Scratchpad } from '@atlas/mcp-scratchpad';
import { z, ZodError } from 'zod';

import { GeneratorError } from './errors.js';
import { emitMcpServer, type McpServerResult } from './mcp-server.js';
import { emitOpenApi, type OpenApiResult } from './openapi.js';
import { emitTestSuite, type TestSuiteResult } from './test-suite.js';

const RunInputSchema = z.object({
    run_id: z.string().min(1),
    out_dir: z.string().min(1).optional(),
});

export interface ToolsConfig {
    readonly scratchpadPath: string;
    readonly runsRoot: string;
}

export function runEmitOpenApi(
    config: ToolsConfig,
    raw: unknown,
): OpenApiResult & { written_to: string } {
    const input = parseOrThrow(RunInputSchema, raw);
    const facts = readMergedFacts(config, input.run_id);
    const result = emitOpenApi(facts, { runId: input.run_id });
    const outPath = join(
        input.out_dir ?? defaultArtifactsDir(config, input.run_id),
        'openapi.yaml',
    );
    writeArtifact(outPath, result.yaml);
    return { ...result, written_to: outPath };
}

export function runEmitMcpServer(config: ToolsConfig, raw: unknown): McpServerResult {
    const input = parseOrThrow(RunInputSchema, raw);
    const facts = readMergedFacts(config, input.run_id);
    const outDir = join(input.out_dir ?? defaultArtifactsDir(config, input.run_id), 'mcp-server');
    return emitMcpServer(facts, { runId: input.run_id, outDir });
}

export function runEmitTestSuite(config: ToolsConfig, raw: unknown): TestSuiteResult {
    const input = parseOrThrow(RunInputSchema, raw);
    const facts = readMergedFacts(config, input.run_id);
    const outDir = join(input.out_dir ?? defaultArtifactsDir(config, input.run_id), 'tests');
    return emitTestSuite(facts, { runId: input.run_id, outDir });
}

function readMergedFacts(
    config: ToolsConfig,
    runId: string,
): ReturnType<Scratchpad['selectMergedFacts']> {
    let scratchpad: Scratchpad;
    try {
        scratchpad = new Scratchpad(config.scratchpadPath);
        scratchpad.migrate();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new GeneratorError('SCRATCHPAD_UNREACHABLE', `cannot open scratchpad: ${message}`);
    }
    try {
        const facts = scratchpad.selectMergedFacts({ run_id: runId });
        if (facts.length === 0) {
            throw new GeneratorError(
                'NO_MERGED_FACTS',
                `no merged_facts for run_id ${runId}; run synthesize first`,
            );
        }
        return facts;
    } finally {
        scratchpad.close();
    }
}

function writeArtifact(path: string, content: string): void {
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new GeneratorError('WRITE_FAILED', `cannot write ${path}: ${message}`);
    }
}

function defaultArtifactsDir(config: ToolsConfig, runId: string): string {
    return join(config.runsRoot, runId, 'artifacts');
}

function parseOrThrow<T>(
    schema: {
        safeParse: (
            raw: unknown,
        ) => { success: true; data: T } | { success: false; error: ZodError };
    },
    raw: unknown,
): T {
    const result = schema.safeParse(raw);
    if (result.success) return result.data;
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new GeneratorError('INVALID_INPUT', `invalid input: ${issues}`);
}
