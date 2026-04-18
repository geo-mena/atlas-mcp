import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { TrafficSnifferError } from './errors.js';
import type { ProxyRegistry } from './registry.js';
import { dumpHar, startProxy, stopProxy, type ToolsConfig } from './tools.js';

const SERVER_NAME = 'atlas-traffic-sniffer';
const SERVER_VERSION = '0.1.0-alpha.0';

const TOOL_DEFINITIONS = [
  {
    name: 'start_proxy',
    description:
      'Spawn a mitmdump subprocess that captures HTTP/HTTPS traffic for the given run_id. Writes flows to a HAR file as they complete. Requires mitmproxy to be installed and on PATH.',
    inputSchema: {
      type: 'object',
      required: ['run_id'],
      properties: {
        run_id: { type: 'string', minLength: 1 },
        upstream_url: { type: 'string' },
      },
    },
  },
  {
    name: 'stop_proxy',
    description: 'Terminate the mitmdump subprocess for the given run_id. The HAR file remains on disk for downstream analysis.',
    inputSchema: {
      type: 'object',
      required: ['run_id'],
      properties: { run_id: { type: 'string', minLength: 1 } },
    },
  },
  {
    name: 'dump_har',
    description: 'Read the HAR file for the given run_id and return a summary (entry count, distinct endpoints).',
    inputSchema: {
      type: 'object',
      required: ['run_id'],
      properties: { run_id: { type: 'string', minLength: 1 } },
    },
  },
] as const;

export function buildServer(registry: ProxyRegistry, config: ToolsConfig): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({ tools: TOOL_DEFINITIONS as unknown as never[] }),
  );

  server.setRequestHandler(CallToolRequestSchema, (request) =>
    Promise.resolve(dispatch(registry, config, request.params.name, request.params.arguments)),
  );

  return server;
}

function dispatch(
  registry: ProxyRegistry,
  config: ToolsConfig,
  name: string,
  args: unknown,
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    switch (name) {
      case 'start_proxy':
        return ok(startProxy(registry, config, args));
      case 'stop_proxy':
        return ok(stopProxy(registry, args));
      case 'dump_har':
        return ok(dumpHar(registry, args));
      default:
        return error('INVALID_INPUT', `unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof TrafficSnifferError) return error(err.code, err.message);
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
