import { z } from 'zod';

export const ConfidenceLevels = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof ConfidenceLevels)[number];

export const SourceAgentNames = [
  'code-spelunker',
  'ui-explorer',
  'traffic-sniffer',
  'doc-harvester',
] as const;
export type SourceAgent = (typeof SourceAgentNames)[number];

export const FactTypes = [
  'route',
  'controller_action',
  'db_query',
  'external_call',
  'ui_screen',
  'ui_field',
  'ui_validation',
  'ui_transition',
  'http_request',
  'http_response',
  'auth_artifact',
  'payload_field',
  'business_rule',
  'compliance_constraint',
  'field_definition',
  'partial_progress',
] as const;
export type FactType = (typeof FactTypes)[number];

export const FactInputSchema = z.object({
  run_id: z.string().min(1),
  source_agent: z.enum(SourceAgentNames),
  fact_type: z.string().min(1),
  content: z.record(z.unknown()),
  evidence_uri: z.string().min(1),
  confidence: z.enum(ConfidenceLevels),
  conflicts_with: z.array(z.number().int().positive()).optional(),
});
export type FactInput = z.infer<typeof FactInputSchema>;

export const FactSchema = FactInputSchema.extend({
  id: z.number().int().positive(),
  created_at: z.string(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactFilterSchema = z.object({
  run_id: z.string().min(1),
  source_agent: z.enum(SourceAgentNames).optional(),
  fact_type: z.string().min(1).optional(),
});
export type FactFilter = z.infer<typeof FactFilterSchema>;

export type Verdict = 'PASS' | 'PASS-WITH-NOISE' | 'HUMAN-REVIEW' | 'FAIL';

export const ResolutionTypes = ['unanimous', 'priority', 'recency', 'confidence', 'unresolved'] as const;
export type Resolution = (typeof ResolutionTypes)[number];

export const MergedFactInputSchema = z.object({
  run_id: z.string().min(1),
  fact_type: z.string().min(1),
  content: z.record(z.unknown()),
  resolution: z.enum(ResolutionTypes),
  source_fact_ids: z.array(z.number().int().positive()).min(1),
  winning_source: z.enum(SourceAgentNames).nullable(),
  confidence: z.enum(ConfidenceLevels),
  conflicts: z.array(z.number().int().positive()).optional(),
});
export type MergedFactInput = z.infer<typeof MergedFactInputSchema>;

export const MergedFactSchema = MergedFactInputSchema.extend({
  id: z.number().int().positive(),
  created_at: z.string(),
});
export type MergedFact = z.infer<typeof MergedFactSchema>;

export const MergedFactFilterSchema = z.object({
  run_id: z.string().min(1),
  fact_type: z.string().min(1).optional(),
  resolution: z.enum(ResolutionTypes).optional(),
});
export type MergedFactFilter = z.infer<typeof MergedFactFilterSchema>;

export type ScratchpadErrorCode =
  | 'INVARIANT_VIOLATION'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'INTERNAL';

export class ScratchpadError extends Error {
  readonly code: ScratchpadErrorCode;

  constructor(code: ScratchpadErrorCode, message: string) {
    super(message);
    this.name = 'ScratchpadError';
    this.code = code;
  }
}
