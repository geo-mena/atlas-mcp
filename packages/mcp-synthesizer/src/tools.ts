import { Scratchpad } from '@atlas/mcp-scratchpad';
import { z, ZodError } from 'zod';

import { SynthesizerError } from './errors.js';
import { synthesize, type SynthesisResult } from './synthesize.js';

const SynthesizeInputSchema = z.object({
    run_id: z.string().min(1),
});

const MergedFactsInputSchema = z.object({
    run_id: z.string().min(1),
    fact_type: z.string().min(1).optional(),
    resolution: z.enum(['unanimous', 'priority', 'recency', 'confidence', 'unresolved']).optional(),
});

const ConflictsInputSchema = z.object({
    run_id: z.string().min(1),
});

export interface ToolsConfig {
    readonly scratchpadPath: string;
}

export function runSynthesize(config: ToolsConfig, raw: unknown): SynthesisResult {
    const input = parseOrThrow(SynthesizeInputSchema, raw);
    const scratchpad = openScratchpad(config);
    try {
        return synthesize(scratchpad, input.run_id);
    } finally {
        scratchpad.close();
    }
}

export function listMergedFacts(
    config: ToolsConfig,
    raw: unknown,
): { merged_facts: ReturnType<Scratchpad['selectMergedFacts']> } {
    const input = parseOrThrow(MergedFactsInputSchema, raw);
    const scratchpad = openScratchpad(config);
    try {
        const facts = scratchpad.selectMergedFacts(input);
        return { merged_facts: facts };
    } finally {
        scratchpad.close();
    }
}

export function listConflicts(
    config: ToolsConfig,
    raw: unknown,
): {
    conflicts: ReturnType<Scratchpad['selectMergedFacts']>;
} {
    const input = parseOrThrow(ConflictsInputSchema, raw);
    const scratchpad = openScratchpad(config);
    try {
        const conflicts = scratchpad.selectMergedFacts({
            run_id: input.run_id,
            resolution: 'unresolved',
        });
        return { conflicts };
    } finally {
        scratchpad.close();
    }
}

function openScratchpad(config: ToolsConfig): Scratchpad {
    try {
        const scratchpad = new Scratchpad(config.scratchpadPath);
        scratchpad.migrate();
        return scratchpad;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new SynthesizerError(
            'SCRATCHPAD_UNREACHABLE',
            `cannot open scratchpad at ${config.scratchpadPath}: ${message}`,
        );
    }
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
    throw new SynthesizerError('INVALID_INPUT', `invalid input: ${issues}`);
}
