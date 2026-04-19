import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { GeneratorError } from './errors.js';
import { runEmitMcpServer, runEmitOpenApi, runEmitTestSuite, type ToolsConfig } from './tools.js';

const SERVER_NAME = 'atlas-generators';
const SERVER_VERSION = '0.1.0-alpha.0';

const TOOL_DEFINITIONS = [
    {
        name: 'emit_openapi',
        description:
            'Generate an OpenAPI 3.1 spec at <out_dir>/openapi.yaml from merged_facts. Defaults out_dir to .atlas/runs/<run_id>/artifacts/.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: {
                run_id: { type: 'string', minLength: 1 },
                out_dir: { type: 'string', minLength: 1 },
            },
        },
    },
    {
        name: 'emit_mcp_server',
        description:
            'Generate a TypeScript MCP server scaffold at <out_dir>/mcp-server/ from merged_facts. One tool per route fact.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: {
                run_id: { type: 'string', minLength: 1 },
                out_dir: { type: 'string', minLength: 1 },
            },
        },
    },
    {
        name: 'emit_test_suite',
        description:
            'Generate a Vitest + nock test suite at <out_dir>/tests/ from merged_facts. One case per http_request/http_response scenario.',
        inputSchema: {
            type: 'object',
            required: ['run_id'],
            properties: {
                run_id: { type: 'string', minLength: 1 },
                out_dir: { type: 'string', minLength: 1 },
            },
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
            case 'emit_openapi':
                return ok(runEmitOpenApi(config, args));
            case 'emit_mcp_server':
                return ok(runEmitMcpServer(config, args));
            case 'emit_test_suite':
                return ok(runEmitTestSuite(config, args));
            default:
                return error('INVALID_INPUT', `unknown tool: ${name}`);
        }
    } catch (err) {
        if (err instanceof GeneratorError) return error(err.code, err.message);
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
