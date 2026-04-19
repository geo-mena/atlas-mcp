import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { SynthesizerError } from './errors.js';
import { listConflicts, listMergedFacts, runSynthesize, type ToolsConfig } from './tools.js';

const SERVER_NAME = 'atlas-synthesizer';
const SERVER_VERSION = '0.1.0-alpha.0';

const TOOL_DEFINITIONS = [
    {
        name: 'synthesize',
        description:
            'Group all source-agent facts for the run by logical key, resolve disagreements via deterministic policy, and persist merged_facts. Idempotent: re-running replaces prior merged_facts for the run.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: { run_id: { type: 'string', minLength: 1 } },
        },
    },
    {
        name: 'merged_facts',
        description:
            'Read merged_facts for a run, optionally filtered by fact_type and resolution.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: {
                run_id: { type: 'string', minLength: 1 },
                fact_type: { type: 'string', minLength: 1 },
                resolution: {
                    type: 'string',
                    enum: ['unanimous', 'priority', 'recency', 'confidence', 'unresolved'],
                },
            },
        },
    },
    {
        name: 'conflicts',
        description:
            'Shortcut for merged_facts({ run_id, resolution: "unresolved" }) — surfaces only the items needing human review.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: { run_id: { type: 'string', minLength: 1 } },
        },
    },
] as const;

export function buildServer(config: ToolsConfig): Server {
    const server = new Server(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, () =>
        Promise.resolve({ tools: TOOL_DEFINITIONS as unknown as never[] }),
    );

    server.setRequestHandler(CallToolRequestSchema, (request) =>
        Promise.resolve(dispatch(config, request.params.name, request.params.arguments)),
    );

    return server;
}

function dispatch(
    config: ToolsConfig,
    name: string,
    args: unknown,
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
    try {
        switch (name) {
            case 'synthesize':
                return ok(runSynthesize(config, args));
            case 'merged_facts':
                return ok(listMergedFacts(config, args));
            case 'conflicts':
                return ok(listConflicts(config, args));
            default:
                return error('INVALID_INPUT', `unknown tool: ${name}`);
        }
    } catch (err) {
        if (err instanceof SynthesizerError) return error(err.code, err.message);
        const message = err instanceof Error ? err.message : String(err);
        return error('INTERNAL', message);
    }
}

function ok(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function error(
    code: string,
    message: string,
): { content: Array<{ type: 'text'; text: string }>; isError: true } {
    return {
        content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }) }],
        isError: true,
    };
}
