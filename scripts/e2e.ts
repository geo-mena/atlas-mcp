#!/usr/bin/env tsx
/**
 * Atlas end-to-end pipeline test.
 *
 * Exercises every layer of Atlas without Claude Code, without LLMs, without
 * Docker. Useful as a rehearsal substrate for the hackathon demo and as
 * proof-of-life for reviewers who want to see the architecture working in
 * under 30 seconds.
 *
 * Pipeline:
 *   1. Bootstrap a per-run scratchpad
 *   2. Insert synthetic source-agent facts (one per source agent)
 *   3. Synthesize → merged_facts
 *   4. emit_openapi → artifacts/openapi.yaml
 *   5. emit_mcp_server → artifacts/mcp-server/
 *   6. emit_test_suite → artifacts/tests/
 *   7. Audit synthetic scenarios → audit/report.md (Run verdict: PASS)
 *
 * Asserts each artifact is present and well-formed; prints a one-line
 * summary on success.
 */

import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Scratchpad, writeFact } from '@atlas/mcp-scratchpad';
import { synthesize } from '@atlas/mcp-synthesizer';
import { emitMcpServer, emitOpenApi, emitTestSuite } from '@atlas/generators';
import { auditScenarios, writeReports } from '@atlas/mcp-fidelity-auditor';
import { parse as parseYaml } from 'yaml';

const RUN_ID = 'e2e';

interface PipelineSummary {
    source_facts: number;
    merged_facts: number;
    openapi_paths: number;
    mcp_tools: number;
    test_scenarios: number;
    audit_verdict: string;
    audit_coverage: number;
}

function main(): void {
    const tmp = mkdtempSync(join(tmpdir(), 'atlas-e2e-'));
    const scratchpadPath = join(tmp, 'scratchpad.sqlite');
    const artifactsDir = join(tmp, 'artifacts');
    const auditDir = join(tmp, 'audit');

    const scratchpad = new Scratchpad(scratchpadPath);

    try {
        scratchpad.migrate();

        const sourceCount = seedSourceFacts(scratchpad);
        const synth = synthesize(scratchpad, RUN_ID);
        assert.equal(synth.unresolved_count, 0, 'expected zero unresolved conflicts in e2e seed');

        const merged = scratchpad.selectMergedFacts({ run_id: RUN_ID });

        const openapi = emitOpenApi(merged, { runId: RUN_ID });
        const parsedSpec = parseYaml(openapi.yaml) as {
            openapi: string;
            paths: Record<string, unknown>;
        };
        assert.equal(parsedSpec.openapi, '3.1.0', 'openapi 3.1 expected');
        assert.ok(openapi.path_count > 0, 'expected ≥ 1 OpenAPI path');

        const mcpServer = emitMcpServer(merged, {
            runId: RUN_ID,
            outDir: join(artifactsDir, 'mcp-server'),
        });
        assert.ok(mcpServer.tool_count > 0, 'expected ≥ 1 generated MCP tool');
        assertExists(join(artifactsDir, 'mcp-server', 'src', 'index.ts'));
        assertExists(join(artifactsDir, 'mcp-server', 'package.json'));

        const testSuite = emitTestSuite(merged, {
            runId: RUN_ID,
            outDir: join(artifactsDir, 'tests'),
        });
        assert.ok(testSuite.scenario_count > 0, 'expected ≥ 1 test scenario');
        assertExists(join(artifactsDir, 'tests', 'tests', 'replay.test.ts'));

        const auditResult = auditScenarios(buildSyntheticScenarios(), {
            run_id: RUN_ID,
            classify: { noise_allowlist: ['$.timestamp'] },
            pass_threshold: 0.9,
        });
        assert.equal(
            auditResult.run_verdict,
            'PASS',
            `expected audit PASS, got ${auditResult.run_verdict}`,
        );

        const auditPaths = writeReports(auditResult, auditDir);
        const reportMd = readFileSync(auditPaths.report_md, 'utf8');
        assert.match(reportMd, /Run verdict: PASS/);

        const summary: PipelineSummary = {
            source_facts: sourceCount,
            merged_facts: synth.merged_count,
            openapi_paths: openapi.path_count,
            mcp_tools: mcpServer.tool_count,
            test_scenarios: testSuite.scenario_count,
            audit_verdict: auditResult.run_verdict,
            audit_coverage: auditResult.coverage_pct,
        };

        process.stdout.write(`atlas e2e OK ${JSON.stringify(summary)}\n`);
    } finally {
        scratchpad.close();
        rmSync(tmp, { recursive: true, force: true });
    }
}

function seedSourceFacts(scratchpad: Scratchpad): number {
    const facts = [
        {
            source_agent: 'code-spelunker' as const,
            fact_type: 'route',
            content: {
                method: 'POST',
                path: '/ve/invoice',
                controller: 'InvoiceController@submit',
            },
            evidence_uri: 'file:///legacy/public/index.php#L18-L22',
        },
        {
            source_agent: 'traffic-sniffer' as const,
            fact_type: 'route',
            content: {
                method: 'POST',
                path: '/ve/invoice',
                controller: 'InvoiceController@submit',
            },
            evidence_uri: 'har://golden#0',
        },
        {
            source_agent: 'code-spelunker' as const,
            fact_type: 'controller_action',
            content: {
                class: 'InvoiceController',
                method: 'submit',
                params: ['customer_id', 'product_id', 'quantity', 'currency'],
                validations: ['customer_id required', 'quantity ≥ 1'],
            },
            evidence_uri: 'file:///legacy/src/Controllers/InvoiceController.php#L36-L52',
        },
        {
            source_agent: 'ui-explorer' as const,
            fact_type: 'ui_field',
            content: {
                screen: '/ve/invoice',
                name: 'customer_id',
                label: 'Customer',
                input_type: 'select',
                required: true,
            },
            evidence_uri: 'snapshot:///e2e/screens/invoice-form.txt#customer_id',
        },
        {
            source_agent: 'doc-harvester' as const,
            fact_type: 'field_definition',
            content: { name: 'amount', type: 'decimal', required: true, format: 'monetary-2dp' },
            evidence_uri: 'file:///corpus/confluence/ve-ebilling-overview.md#L45-L52',
        },
        {
            source_agent: 'traffic-sniffer' as const,
            fact_type: 'http_request',
            content: {
                scenario_id: 'happy',
                method: 'POST',
                url: 'http://localhost:8080/ve/invoice',
            },
            evidence_uri: 'har://golden#1',
        },
        {
            source_agent: 'traffic-sniffer' as const,
            fact_type: 'http_response',
            content: {
                scenario_id: 'happy',
                status: 302,
                method: 'POST',
                url: 'http://localhost:8080/ve/invoice',
            },
            evidence_uri: 'har://golden#1',
        },
        {
            source_agent: 'doc-harvester' as const,
            fact_type: 'business_rule',
            content: {
                statement: 'Control numbers must be unique per taxpayer per fiscal period',
                scope: 'invoice-issuance',
            },
            evidence_uri: 'file:///corpus/confluence/ve-control-number-policy.md#L9-L11',
        },
    ];

    for (const f of facts) {
        writeFact(scratchpad, {
            run_id: RUN_ID,
            source_agent: f.source_agent,
            fact_type: f.fact_type,
            content: f.content,
            evidence_uri: f.evidence_uri,
            confidence: 'high',
        });
    }

    return facts.length;
}

function buildSyntheticScenarios(): Parameters<typeof auditScenarios>[0] {
    return [
        {
            scenario_id: 'happy-byte-equal',
            request: { method: 'POST', url: 'http://localhost:8080/ve/invoice' },
            legacy_response: {
                status: 302,
                content_type: 'application/json',
                body: '{"control_number":"VE-1001","status":"authorized"}',
            },
            candidate_response: {
                status: 302,
                content_type: 'application/json',
                body: '{"status":"authorized","control_number":"VE-1001"}',
            },
        },
        {
            scenario_id: 'health-with-noise',
            request: { method: 'GET', url: 'http://localhost:8080/health' },
            legacy_response: {
                status: 200,
                content_type: 'application/json',
                body: '{"status":"ok","timestamp":"2026-04-18T22:00:00Z"}',
            },
            candidate_response: {
                status: 200,
                content_type: 'application/json',
                body: '{"status":"ok","timestamp":"2026-04-18T22:00:01Z"}',
            },
        },
    ];
}

function assertExists(path: string): void {
    assert.ok(existsSync(path) && statSync(path).isFile(), `expected file at ${path}`);
}

main();
