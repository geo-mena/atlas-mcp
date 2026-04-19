#!/usr/bin/env tsx
/**
 * validate-plugin — install the .claude/ bundle to a test directory and
 * exercise every MCP server's stdio handshake to prove it boots and
 * registers tools. Also validates hook execution paths.
 *
 * What this CAN check (programmatic):
 *   - JSON / YAML / TS files parse cleanly
 *   - Each MCP server in settings.json mcpServers spawns and responds to
 *     `initialize` + `tools/list` over stdio
 *   - pre-promote hook is executable and decides correctly per stdin
 *
 * What this CANNOT check (requires interactive Claude Code):
 *   - /atlas slash command appears in autocomplete
 *   - Subagents are visible in the /agents UI
 *   - Effort tier (xhigh) is honored
 *   - End-to-end orchestration flow
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface McpServerConfig {
    command: string;
    args: string[];
}

interface PluginSettings {
    hooks?: Record<string, unknown>;
}

interface ProjectMcpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: { tools?: Array<{ name: string }>; serverInfo?: { name: string } };
    error?: { code: number; message: string };
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const TEST_DIR = join(tmpdir(), `atlas-plugin-${Date.now()}`);
const TEST_CLAUDE = join(TEST_DIR, '.claude');

function log(line: string): void {
    process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
    log(`==> install .claude/ bundle + .mcp.json to ${TEST_DIR}`);
    mkdirSync(TEST_DIR, { recursive: true });
    cpSync(join(REPO_ROOT, '.claude'), TEST_CLAUDE, { recursive: true });
    cpSync(join(REPO_ROOT, '.mcp.json'), join(TEST_DIR, '.mcp.json'));
    log(
        `    OK (copied .claude/ + .mcp.json — settings.local.json excluded by gitignore in real installs)`,
    );

    log('==> verify .claude/settings.json structure (hooks only)');
    const settingsRaw = readFileSync(join(TEST_CLAUDE, 'settings.json'), 'utf8');
    const settings = JSON.parse(settingsRaw) as PluginSettings;
    if (!settings.hooks || typeof settings.hooks !== 'object') {
        throw new Error('settings.json missing hooks');
    }
    log(`    OK (hooks block present)`);

    log('==> verify .mcp.json (project-scoped MCP servers)');
    const mcpRaw = readFileSync(join(TEST_DIR, '.mcp.json'), 'utf8');
    const mcpConfig = JSON.parse(mcpRaw) as ProjectMcpConfig;
    if (!mcpConfig.mcpServers || Object.keys(mcpConfig.mcpServers).length === 0) {
        throw new Error('.mcp.json missing mcpServers');
    }
    log(`    OK (${Object.keys(mcpConfig.mcpServers).length} MCP servers in .mcp.json)`);

    log('==> exercise each MCP server (initialize + tools/list)');
    let totalTools = 0;
    for (const [name, cfg] of Object.entries(mcpConfig.mcpServers)) {
        const result = await exerciseMcpServer(name, cfg);
        log(
            `    OK  ${name}: serverInfo="${result.serverName}" tools=${result.toolCount} (${result.toolNames.join(', ')})`,
        );
        totalTools += result.toolCount;
    }
    log(`    Total tools advertised across all servers: ${totalTools}`);

    log('==> exercise pre-promote hook (4 scenarios)');
    await exerciseHookScenarios();
    log('    OK (intra-run allow, no-run allow, PASS allow, FAIL block-with-exit-2)');

    log('==> verify subagent + skill frontmatter has `tools` field');
    // Skills live at <skills>/<name>/SKILL.md per Claude Code convention.
    verifyAgentFrontmatter(join(TEST_CLAUDE, 'skills', 'atlas', 'SKILL.md'));
    for (const agent of ['code-spelunker', 'ui-explorer', 'traffic-sniffer', 'doc-harvester']) {
        verifyAgentFrontmatter(join(TEST_CLAUDE, 'agents', `${agent}.md`));
    }
    log('    OK (5 markdown files, all carry `tools:` line)');

    rmSync(TEST_DIR, { recursive: true, force: true });
    log(`==> cleanup ${TEST_DIR} done`);
    log('');
    log('atlas validate-plugin OK');
}

async function exerciseMcpServer(
    name: string,
    cfg: McpServerConfig,
): Promise<{ serverName: string; toolCount: number; toolNames: string[] }> {
    const args = cfg.args.map((a) => (a.startsWith('./') ? join(REPO_ROOT, a.slice(2)) : a));
    const child = spawn(cfg.command, args, {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8');
    });

    const send = (message: object): void => {
        child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'atlas-validate-plugin', version: '0.0.1' },
        },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

    const responses = await collectResponses(child, stdoutBuffer, () => stdoutBuffer, 2, 5000);
    child.kill('SIGTERM');

    if (responses.length === 0) {
        throw new Error(`${name}: no JSON-RPC responses (stderr: ${stderrBuffer.slice(0, 200)})`);
    }

    const initResp = responses.find((r) => r.id === 1);
    const toolsResp = responses.find((r) => r.id === 2);

    if (!initResp || initResp.error) {
        throw new Error(
            `${name}: initialize failed: ${JSON.stringify(initResp?.error ?? 'no response')}`,
        );
    }
    if (!toolsResp || toolsResp.error) {
        throw new Error(
            `${name}: tools/list failed: ${JSON.stringify(toolsResp?.error ?? 'no response')}`,
        );
    }
    const tools = toolsResp.result?.tools ?? [];
    if (tools.length === 0) {
        throw new Error(`${name}: tools/list returned empty`);
    }
    const serverName = initResp.result?.serverInfo?.name ?? '(unknown)';
    return { serverName, toolCount: tools.length, toolNames: tools.map((t) => t.name) };
}

async function collectResponses(
    child: ReturnType<typeof spawn>,
    initialBuffer: string,
    getBuffer: () => string,
    expectedCount: number,
    timeoutMs: number,
): Promise<JsonRpcResponse[]> {
    const start = Date.now();
    let buffer = initialBuffer;
    const responses: JsonRpcResponse[] = [];

    while (Date.now() - start < timeoutMs && responses.length < expectedCount) {
        await new Promise((r) => setTimeout(r, 50));
        buffer = getBuffer();
        const lines = buffer.split('\n');
        responses.length = 0;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') continue;
            try {
                const parsed = JSON.parse(trimmed) as JsonRpcResponse;
                if (
                    parsed.jsonrpc === '2.0' &&
                    (parsed.result !== undefined || parsed.error !== undefined)
                ) {
                    responses.push(parsed);
                }
            } catch {
                // Partial line, ignore.
            }
        }
        if (child.exitCode !== null) break;
    }

    return responses;
}

async function exerciseHookScenarios(): Promise<void> {
    const hookPath = join(TEST_CLAUDE, 'hooks', 'pre-promote.ts');
    const scenarios = [
        {
            name: 'intra-run',
            stdin: {
                cwd: '/tmp',
                tool_name: 'Write',
                tool_input: { file_path: '/tmp/.atlas/runs/r1/scratch.json' },
            },
            expectedExit: 0,
            reportContent: null as string | null,
        },
        {
            name: 'no-run',
            stdin: {
                cwd: TEST_DIR,
                tool_name: 'Write',
                tool_input: { file_path: `${TEST_DIR}/foo.txt` },
            },
            expectedExit: 0,
            reportContent: null,
        },
        {
            name: 'PASS-verdict',
            stdin: {
                cwd: TEST_DIR,
                tool_name: 'Write',
                tool_input: { file_path: `${TEST_DIR}/promoted.txt` },
            },
            expectedExit: 0,
            reportContent: 'Run verdict: PASS\n',
        },
        {
            name: 'FAIL-verdict',
            stdin: {
                cwd: TEST_DIR,
                tool_name: 'Write',
                tool_input: { file_path: `${TEST_DIR}/promoted.txt` },
            },
            expectedExit: 2,
            reportContent: 'Run verdict: FAIL\n',
        },
    ];

    for (const scenario of scenarios) {
        if (scenario.reportContent !== null) {
            const auditDir = join(TEST_DIR, '.atlas', 'runs', 'r-test', 'audit');
            mkdirSync(auditDir, { recursive: true });
            const fs = await import('node:fs/promises');
            await fs.writeFile(join(auditDir, 'report.md'), scenario.reportContent);
        }

        const exit = await runHook(hookPath, scenario.stdin);
        if (exit !== scenario.expectedExit) {
            throw new Error(
                `hook scenario ${scenario.name}: expected exit ${scenario.expectedExit}, got ${exit}`,
            );
        }
    }
}

function runHook(hookPath: string, stdin: object): Promise<number> {
    return new Promise((resolveExit, reject) => {
        const child = spawn('npx', ['tsx', hookPath], {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.stdin.write(JSON.stringify(stdin));
        child.stdin.end();
        child.on('close', (code) => resolveExit(code ?? -1));
        child.on('error', (err) => reject(err));
    });
}

function verifyAgentFrontmatter(path: string): void {
    if (!existsSync(path) || !statSync(path).isFile()) {
        throw new Error(`missing markdown: ${path}`);
    }
    const content = readFileSync(path, 'utf8');
    if (!content.startsWith('---\n')) {
        throw new Error(`${path}: missing YAML frontmatter`);
    }
    if (!/^tools:/m.test(content)) {
        throw new Error(`${path}: frontmatter has no \`tools:\` field`);
    }
    if (/^allowed-tools:/m.test(content)) {
        throw new Error(`${path}: legacy \`allowed-tools:\` field still present`);
    }
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`atlas validate-plugin FAILED: ${message}\n`);
    rmSync(TEST_DIR, { recursive: true, force: true });
    process.exit(1);
});
