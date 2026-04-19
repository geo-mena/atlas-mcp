import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MergedFact } from '@atlas/shared';

export interface McpServerOptions {
    readonly runId: string;
    readonly outDir: string;
    readonly upstreamBaseUrl?: string;
    readonly serverName?: string;
}

export interface McpServerResult {
    readonly out_dir: string;
    readonly tool_count: number;
    readonly files_written: readonly string[];
}

/**
 * emitMcpServer — write a TypeScript MCP server scaffold derived from
 * merged_facts. One tool per `route` fact; tool inputs from `payload_field`
 * facts grouped by endpoint; tool implementations call the legacy via fetch.
 *
 * Day 5 v0.1 scope: scaffold compiles and lists tools. Real auth/headers,
 * streaming, and pagination land post-MVP.
 */
export function emitMcpServer(
    facts: readonly MergedFact[],
    options: McpServerOptions,
): McpServerResult {
    const routes = facts.filter((f) => f.fact_type === 'route');
    const payloadFields = facts.filter((f) => f.fact_type === 'payload_field');

    const tools = routes.map((route) => buildTool(route, payloadFields));

    mkdirSync(join(options.outDir, 'src'), { recursive: true });
    const written: string[] = [];

    written.push(
        write(
            options.outDir,
            'package.json',
            renderPackageJson(options.serverName ?? `atlas-generated-${options.runId}`),
        ),
    );
    written.push(write(options.outDir, 'tsconfig.json', renderTsconfig()));
    written.push(write(options.outDir, 'README.md', renderReadme(options, tools.length)));
    written.push(write(options.outDir, 'src/index.ts', renderServerSource(options, tools)));

    return { out_dir: options.outDir, tool_count: tools.length, files_written: written };
}

interface ToolSpec {
    readonly name: string;
    readonly description: string;
    readonly method: string;
    readonly path: string;
    readonly properties: Record<string, { type: string }>;
    readonly required: string[];
    readonly evidence: { source_fact_ids: readonly number[]; resolution: string };
}

function buildTool(route: MergedFact, payloadFields: readonly MergedFact[]): ToolSpec {
    const method = String(route.content['method'] ?? 'GET').toUpperCase();
    const path = String(route.content['path'] ?? '/');
    const endpoint = `${method} ${path}`;
    const fieldsForEndpoint = payloadFields.filter(
        (f) =>
            `${String(f.content['method'] ?? '').toUpperCase()} ${String(f.content['endpoint'] ?? '')}` ===
                endpoint || String(f.content['endpoint'] ?? '') === endpoint,
    );

    const properties: Record<string, { type: string }> = {};
    const required: string[] = [];
    for (const field of fieldsForEndpoint) {
        const name = String(field.content['field'] ?? '');
        if (name === '') continue;
        properties[name] = { type: jsonSchemaType(String(field.content['type'] ?? 'string')) };
        if (field.content['required'] === true) required.push(name);
    }

    return {
        name: toolName(method, path),
        description: `Generated tool for ${endpoint}`,
        method,
        path,
        properties,
        required,
        evidence: {
            source_fact_ids: route.source_fact_ids,
            resolution: route.resolution,
        },
    };
}

function toolName(method: string, path: string): string {
    const slug = path
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return `${method.toLowerCase()}_${slug || 'root'}`;
}

function jsonSchemaType(declared: string): string {
    switch (declared.toLowerCase()) {
        case 'integer':
        case 'int':
            return 'integer';
        case 'decimal':
        case 'float':
        case 'number':
        case 'numeric':
            return 'number';
        case 'boolean':
        case 'bool':
            return 'boolean';
        default:
            return 'string';
    }
}

function write(outDir: string, relPath: string, content: string): string {
    const fullPath = join(outDir, relPath);
    mkdirSync(join(outDir, relPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
    return relPath;
}

function renderPackageJson(name: string): string {
    return `${JSON.stringify(
        {
            name,
            version: '0.1.0-alpha.0',
            private: true,
            type: 'module',
            bin: { [name]: './dist/index.js' },
            scripts: {
                build: 'tsup src/index.ts --format esm --dts --clean',
                typecheck: 'tsc --noEmit',
            },
            dependencies: {
                '@modelcontextprotocol/sdk': '^1.29.0',
            },
            devDependencies: {
                '@types/node': '^20.14.0',
                tsup: '^8.5.1',
                typescript: '^5.6.0',
            },
        },
        null,
        2,
    )}\n`;
}

function renderTsconfig(): string {
    return `${JSON.stringify(
        {
            compilerOptions: {
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                outDir: './dist',
                rootDir: './src',
                declaration: true,
            },
            include: ['src/**/*'],
        },
        null,
        2,
    )}\n`;
}

function renderReadme(options: McpServerOptions, toolCount: number): string {
    return (
        `# ${options.serverName ?? `atlas-generated-${options.runId}`}\n\n` +
        `Generated by Atlas from run \`${options.runId}\`. Exposes ${toolCount} MCP tool(s) derived from the legacy's route surface.\n\n` +
        `## Install\n\n` +
        '```bash\n' +
        'npm install\n' +
        'npm run build\n' +
        '```\n\n' +
        `## Wire into Claude Code\n\n` +
        '```json\n' +
        `{\n  "mcpServers": {\n    "${options.serverName ?? 'atlas-generated'}": {\n      "command": "node",\n      "args": ["./dist/index.js"]\n    }\n  }\n}\n` +
        '```\n\n' +
        `## Upstream\n\nThis scaffold expects \`ATLAS_UPSTREAM_BASE_URL\` to point at the legacy host (default: \`${options.upstreamBaseUrl ?? 'http://localhost:8080'}\`).\n`
    );
}

function renderServerSource(options: McpServerOptions, tools: readonly ToolSpec[]): string {
    const baseUrl = options.upstreamBaseUrl ?? 'http://localhost:8080';
    const toolDefs = tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: {
            type: 'object',
            required: t.required,
            properties: t.properties,
        },
        'x-atlas-evidence': t.evidence,
        'x-atlas-method': t.method,
        'x-atlas-path': t.path,
    }));

    return `#!/usr/bin/env node
/**
 * Atlas-generated MCP server for run ${options.runId}.
 *
 * Day 5 v0.1 scaffold. Each tool issues an HTTP request to the upstream
 * legacy. Auth, headers, content-type negotiation, and error mapping are
 * intentionally minimal — refine post-generation per project needs.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const UPSTREAM = process.env.ATLAS_UPSTREAM_BASE_URL ?? '${baseUrl}';

const TOOLS = ${JSON.stringify(toolDefs, null, 2)} as const;

const server = new Server(
  { name: '${options.serverName ?? `atlas-generated-${options.runId}`}', version: '0.1.0-alpha.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({ tools: TOOLS as unknown as never[] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: request.params.name } }) }],
      isError: true,
    };
  }

  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const url = new URL(tool['x-atlas-path'], UPSTREAM);
  const init: RequestInit = { method: tool['x-atlas-method'] };
  if (tool['x-atlas-method'] !== 'GET') {
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
    init.body = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v ?? '')])).toString();
  } else {
    for (const [k, v] of Object.entries(args)) url.searchParams.set(k, String(v ?? ''));
  }

  const response = await fetch(url.toString(), init);
  const body = await response.text();
  return {
    content: [
      { type: 'text', text: JSON.stringify({ status: response.status, body }) },
    ],
  };
});

await server.connect(new StdioServerTransport());
`;
}
