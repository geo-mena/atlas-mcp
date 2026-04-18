import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ScratchpadError } from '@atlas/shared';

import type { Scratchpad } from './db.js';
import { migrate, readFacts, writeFact } from './tools.js';

const SERVER_NAME = 'atlas-scratchpad';
const SERVER_VERSION = '0.1.0-alpha.0';

const TOOL_DEFINITIONS = [
  {
    name: 'write_fact',
    description:
      'Persist a single fact to the scratchpad. Refuses writes missing source_agent, evidence_uri, or confidence.',
    inputSchema: {
      type: 'object',
      required: ['run_id', 'source_agent', 'fact_type', 'content', 'evidence_uri', 'confidence'],
      properties: {
        run_id: { type: 'string', minLength: 1 },
        source_agent: {
          type: 'string',
          enum: ['code-spelunker', 'ui-explorer', 'traffic-sniffer', 'doc-harvester'],
        },
        fact_type: { type: 'string', minLength: 1 },
        content: { type: 'object', additionalProperties: true },
        evidence_uri: { type: 'string', minLength: 1 },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        conflicts_with: { type: 'array', items: { type: 'integer', minimum: 1 } },
      },
    },
  },
  {
    name: 'read_facts',
    description: 'Read facts from the scratchpad, filtered by run_id and optionally source_agent / fact_type.',
    inputSchema: {
      type: 'object',
      required: ['run_id'],
      properties: {
        run_id: { type: 'string', minLength: 1 },
        source_agent: {
          type: 'string',
          enum: ['code-spelunker', 'ui-explorer', 'traffic-sniffer', 'doc-harvester'],
        },
        fact_type: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'migrate',
    description: 'Idempotent schema bootstrap. Safe to call multiple times.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

export function buildServer(scratchpad: Scratchpad): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({ tools: TOOL_DEFINITIONS as unknown as never[] }),
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return Promise.resolve(dispatch(scratchpad, name, args));
  });

  return server;
}

function dispatch(scratchpad: Scratchpad, name: string, args: unknown): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    switch (name) {
      case 'write_fact':
        return ok(writeFact(scratchpad, args));
      case 'read_facts':
        return ok(readFacts(scratchpad, args));
      case 'migrate':
        migrate(scratchpad);
        return ok({ ok: true });
      default:
        return error('INVALID_INPUT', `unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof ScratchpadError) return error(err.code, err.message);
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
