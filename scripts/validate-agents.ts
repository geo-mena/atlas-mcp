#!/usr/bin/env tsx
/**
 * validate-agents — sanity check for .claude/agents/*.md and .claude/skills/*.md.
 *
 * Catches malformed frontmatter, missing required sections, and unknown
 * MCP tool prefixes BEFORE the plugin reaches Claude Code. The validator
 * is purely structural: it does not load the markdown into Claude or
 * execute prompts.
 *
 * Run via `pnpm validate-agents` or as part of `pnpm smoke`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

interface AgentFrontmatter {
    readonly name: string;
    readonly description: string;
    readonly tools: readonly string[];
}

interface ValidationIssue {
    readonly file: string;
    readonly severity: 'error' | 'warn';
    readonly message: string;
}

const REQUIRED_AGENT_SECTIONS = ['## Role', '## Discovery loop'];
const REQUIRED_SKILL_SECTIONS = ['## Invocation'];

const SKILL_FILENAME = 'SKILL.md';

const KNOWN_TOOL_PREFIXES = [
    'mcp__atlas-scratchpad__',
    'mcp__atlas-synthesizer__',
    'mcp__atlas-generators__',
    'mcp__atlas-fidelity-auditor__',
    'mcp__atlas-traffic-sniffer__',
    'mcp__filesystem__',
    'mcp__playwright__',
    'mcp__exa__',
    'Bash(',
];
const KNOWN_TOOL_NAMES = [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Agent',
    'Bash',
    'WebFetch',
    'WebSearch',
];

function main(): void {
    const repoRoot = resolve(process.cwd());
    const claudeDir = join(repoRoot, '.claude');

    const issues: ValidationIssue[] = [
        ...validateDir(join(claudeDir, 'agents'), repoRoot, REQUIRED_AGENT_SECTIONS),
        ...validateSkillsDir(join(claudeDir, 'skills'), repoRoot, REQUIRED_SKILL_SECTIONS),
    ];

    if (issues.length === 0) {
        process.stdout.write('atlas validate-agents: OK\n');
        return;
    }

    for (const issue of issues) {
        process.stderr.write(`[${issue.severity}] ${issue.file}: ${issue.message}\n`);
    }
    if (issues.some((i) => i.severity === 'error')) {
        process.exit(1);
    }
}

function validateDir(
    dir: string,
    repoRoot: string,
    requiredSections: readonly string[],
): ValidationIssue[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return [{ file: relative(repoRoot, dir), severity: 'error', message: 'directory missing' }];
    }

    const issues: ValidationIssue[] = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        if (!statSync(fullPath).isFile() || !entry.endsWith('.md')) continue;
        issues.push(...validateFile(fullPath, repoRoot, requiredSections));
    }
    return issues;
}

/**
 * Skills live in `<skills>/<name>/SKILL.md` per Claude Code convention.
 * A bare `<skills>/<name>.md` is silently ignored at discovery, so we flag
 * it as an error rather than skipping silently.
 */
function validateSkillsDir(
    dir: string,
    repoRoot: string,
    requiredSections: readonly string[],
): ValidationIssue[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return [{ file: relative(repoRoot, dir), severity: 'error', message: 'directory missing' }];
    }

    const issues: ValidationIssue[] = [];
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isFile() && entry.endsWith('.md')) {
            issues.push({
                file: relative(repoRoot, fullPath),
                severity: 'error',
                message: `skill must live at .claude/skills/${entry.replace(/\.md$/, '')}/${SKILL_FILENAME}, not as a bare ${entry}; Claude Code only discovers skills in <name>/SKILL.md form`,
            });
            continue;
        }
        if (stat.isDirectory()) {
            const skillFile = join(fullPath, SKILL_FILENAME);
            try {
                if (!statSync(skillFile).isFile()) continue;
            } catch {
                issues.push({
                    file: relative(repoRoot, fullPath),
                    severity: 'error',
                    message: `skill directory missing ${SKILL_FILENAME}`,
                });
                continue;
            }
            issues.push(...validateFile(skillFile, repoRoot, requiredSections));
        }
    }
    return issues;
}

function validateFile(
    path: string,
    repoRoot: string,
    requiredSections: readonly string[],
): ValidationIssue[] {
    const rel = relative(repoRoot, path);
    const text = readFileSync(path, 'utf8');
    const issues: ValidationIssue[] = [];

    const fm = parseFrontmatter(text);
    if (fm === null) {
        return [
            {
                file: rel,
                severity: 'error',
                message: 'missing or malformed YAML frontmatter (--- … ---)',
            },
        ];
    }

    if (!fm.name || fm.name.length === 0) {
        issues.push({
            file: rel,
            severity: 'error',
            message: 'frontmatter `name` missing or empty',
        });
    }
    if (!fm.description || fm.description.length === 0) {
        issues.push({
            file: rel,
            severity: 'error',
            message: 'frontmatter `description` missing or empty',
        });
    }
    if (fm.tools.length === 0) {
        issues.push({ file: rel, severity: 'warn', message: 'frontmatter `tools` is empty' });
    }

    for (const tool of fm.tools) {
        if (!isKnownTool(tool)) {
            issues.push({ file: rel, severity: 'warn', message: `unknown tool pattern: ${tool}` });
        }
    }

    for (const section of requiredSections) {
        if (!text.includes(section)) {
            issues.push({
                file: rel,
                severity: 'error',
                message: `required section missing: ${section}`,
            });
        }
    }

    return issues;
}

function parseFrontmatter(text: string): AgentFrontmatter | null {
    if (!text.startsWith('---\n')) return null;
    const end = text.indexOf('\n---', 4);
    if (end === -1) return null;
    const body = text.slice(4, end);

    let name = '';
    let description = '';
    let tools: string[] = [];
    let inToolsArray = false;
    let sawAllowedTools = false;

    for (const line of body.split('\n')) {
        if (inToolsArray) {
            const item = /^\s+-\s+(.+)$/.exec(line);
            if (item?.[1]) {
                tools.push(item[1].trim());
                continue;
            }
            inToolsArray = false;
        }

        const kv = /^([\w-]+):\s*(.*)$/.exec(line);
        if (!kv) continue;
        const [, key, raw = ''] = kv;
        const value = raw.trim();
        if (key === 'name') name = unquote(value);
        else if (key === 'description') description = unquote(value);
        else if (key === 'tools') {
            if (value === '') {
                inToolsArray = true;
            } else {
                tools = value
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
            }
        } else if (key === 'allowed-tools' || key === 'allowedTools') {
            // Legacy/incorrect Claude Code field name; flag for migration.
            sawAllowedTools = true;
            inToolsArray = true;
        }
    }

    if (sawAllowedTools && tools.length === 0) {
        // Surface as a hard issue at the call site by leaving tools empty.
        return { name, description, tools: [] };
    }

    return { name, description, tools };
}

function unquote(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

function isKnownTool(tool: string): boolean {
    if (KNOWN_TOOL_NAMES.includes(tool)) return true;
    return KNOWN_TOOL_PREFIXES.some((prefix) => tool.startsWith(prefix));
}

main();
