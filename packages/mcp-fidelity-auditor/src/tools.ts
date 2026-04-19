import { z, ZodError } from 'zod';

import {
    auditScenarios,
    type AuditOptions,
    type AuditResult,
    type ScenarioInput,
} from './audit.js';
import { AuditorError } from './errors.js';
import { writeReports, type ReportPaths } from './report.js';

const ResponseSchema = z.object({
    status: z.number().int(),
    content_type: z.string().min(1),
    body: z.string(),
});

const ScenarioSchema = z.object({
    scenario_id: z.string().min(1),
    request: z.object({ method: z.string().min(1), url: z.string().min(1) }),
    legacy_response: ResponseSchema,
    candidate_response: ResponseSchema,
});

const AuditInputSchema = z.object({
    run_id: z.string().min(1),
    scenarios: z.array(ScenarioSchema).min(1),
    audit_dir: z.string().min(1),
    normalization: z
        .object({
            scrub_paths: z.array(z.string()).optional(),
            masks: z
                .array(
                    z.object({
                        pattern: z.string(),
                        replacement: z.string(),
                        content_types: z.array(z.string()).optional(),
                    }),
                )
                .optional(),
            numeric_tolerance: z.number().nonnegative().optional(),
        })
        .optional(),
    noise_allowlist: z.array(z.string()).optional(),
    text_noise_max: z.number().int().nonnegative().optional(),
    pass_threshold: z.number().min(0).max(1).optional(),
});

export interface AuditToolResult {
    readonly result: AuditResult;
    readonly paths: ReportPaths;
}

export function runAudit(raw: unknown): AuditToolResult {
    const input = parseOrThrow(AuditInputSchema, raw);
    if (input.scenarios.length === 0) {
        throw new AuditorError('NO_SCENARIOS', 'audit invoked with empty scenarios array');
    }
    const options = buildAuditOptions(input);
    const result = auditScenarios(input.scenarios as readonly ScenarioInput[], options);
    const paths = writeReports(result, input.audit_dir);
    return { result, paths };
}

function buildAuditOptions(input: z.infer<typeof AuditInputSchema>): AuditOptions {
    const normalization = input.normalization
        ? {
              ...(input.normalization.scrub_paths !== undefined
                  ? { scrub_paths: input.normalization.scrub_paths }
                  : {}),
              ...(input.normalization.masks !== undefined
                  ? {
                        masks: input.normalization.masks.map((m) => ({
                            pattern: m.pattern,
                            replacement: m.replacement,
                            ...(m.content_types !== undefined
                                ? { content_types: m.content_types as readonly NormalizedCt[] }
                                : {}),
                        })),
                    }
                  : {}),
              ...(input.normalization.numeric_tolerance !== undefined
                  ? { numeric_tolerance: input.normalization.numeric_tolerance }
                  : {}),
          }
        : undefined;

    const classify =
        input.noise_allowlist !== undefined || input.text_noise_max !== undefined
            ? {
                  ...(input.noise_allowlist !== undefined
                      ? { noise_allowlist: input.noise_allowlist }
                      : {}),
                  ...(input.text_noise_max !== undefined
                      ? { text_noise_max: input.text_noise_max }
                      : {}),
              }
            : undefined;

    return {
        run_id: input.run_id,
        ...(normalization !== undefined ? { normalization } : {}),
        ...(classify !== undefined ? { classify } : {}),
        ...(input.pass_threshold !== undefined ? { pass_threshold: input.pass_threshold } : {}),
    };
}

type NormalizedCt =
    NonNullable<Parameters<typeof auditScenarios>[1]['normalization']> extends { masks?: infer M }
        ? M extends ReadonlyArray<{ content_types?: ReadonlyArray<infer C> }>
            ? C
            : never
        : never;

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
    throw new AuditorError('INVALID_INPUT', `invalid input: ${issues}`);
}
