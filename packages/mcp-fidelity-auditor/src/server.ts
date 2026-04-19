import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { AuditorError } from './errors.js';
import { runAudit } from './tools.js';

const SERVER_NAME = 'atlas-fidelity-auditor';
const SERVER_VERSION = '0.1.0-alpha.0';

const TOOL_DEFINITIONS = [
  {
    name: 'audit',
    description:
      'Audit a set of paired (legacy, candidate) responses. Writes audit/results.jsonl + audit/report.md + audit/coverage.md + audit/failed/ to <audit_dir>. Returns the run-level verdict (PASS / PASS-WITH-NOISE / HUMAN-REVIEW / FAIL) and per-scenario classification.',
    inputSchema: {
      type: 'object',
      required: ['run_id', 'scenarios', 'audit_dir'],
      properties: {
        run_id: { type: 'string', minLength: 1 },
        audit_dir: { type: 'string', minLength: 1 },
        pass_threshold: { type: 'number', minimum: 0, maximum: 1 },
        noise_allowlist: { type: 'array', items: { type: 'string' } },
        text_noise_max: { type: 'integer', minimum: 0 },
        normalization: {
          type: 'object',
          properties: {
            scrub_paths: { type: 'array', items: { type: 'string' } },
            masks: {
              type: 'array',
              items: {
                type: 'object',
                required: ['pattern', 'replacement'],
                properties: {
                  pattern: { type: 'string' },
                  replacement: { type: 'string' },
                  content_types: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            numeric_tolerance: { type: 'number', minimum: 0 },
          },
        },
        scenarios: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['scenario_id', 'request', 'legacy_response', 'candidate_response'],
            properties: {
              scenario_id: { type: 'string', minLength: 1 },
              request: {
                type: 'object',
                required: ['method', 'url'],
                properties: { method: { type: 'string' }, url: { type: 'string' } },
              },
              legacy_response: {
                type: 'object',
                required: ['status', 'content_type', 'body'],
                properties: {
                  status: { type: 'integer' },
                  content_type: { type: 'string' },
                  body: { type: 'string' },
                },
              },
              candidate_response: {
                type: 'object',
                required: ['status', 'content_type', 'body'],
                properties: {
                  status: { type: 'integer' },
                  content_type: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
] as const;

export function buildServer(): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({ tools: TOOL_DEFINITIONS as unknown as never[] }),
  );

  server.setRequestHandler(CallToolRequestSchema, (request) =>
    Promise.resolve(dispatch(request.params.name, request.params.arguments)),
  );

  return server;
}

function dispatch(name: string, args: unknown): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    switch (name) {
      case 'audit':
        return ok(runAudit(args));
      default:
        return error('INVALID_INPUT', `unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof AuditorError) return error(err.code, err.message);
    const message = err instanceof Error ? err.message : String(err);
    return error('INTERNAL', message);
  }
}

function ok(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function error(code: string, message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }) }],
    isError: true,
  };
}
