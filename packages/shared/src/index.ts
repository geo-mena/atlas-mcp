/**
 * @atlas/shared — types and schemas reused across Atlas MCP servers.
 *
 * Day 0 skeleton. Real schemas land Day 1 alongside mcp-scratchpad.
 */

import { z } from 'zod';

export type Confidence = 'high' | 'medium' | 'low';

export type SourceAgent = 'code-spelunker' | 'ui-explorer' | 'traffic-sniffer' | 'doc-harvester';

export type FactType =
  | 'route'
  | 'controller_action'
  | 'db_query'
  | 'external_call'
  | 'ui_screen'
  | 'ui_field'
  | 'ui_validation'
  | 'ui_transition'
  | 'http_request'
  | 'http_response'
  | 'auth_artifact'
  | 'payload_field'
  | 'business_rule'
  | 'compliance_constraint'
  | 'field_definition'
  | 'partial_progress';

export const FactSchema = z.object({
  id: z.string().uuid().optional(),
  run_id: z.string(),
  source_agent: z.enum(['code-spelunker', 'ui-explorer', 'traffic-sniffer', 'doc-harvester']),
  fact_type: z.string(),
  content: z.record(z.unknown()),
  evidence_uri: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  conflicts_with: z.array(z.string()).optional(),
  created_at: z.string().datetime().optional(),
});

export type Fact = z.infer<typeof FactSchema>;

export type Verdict = 'PASS' | 'PASS-WITH-NOISE' | 'HUMAN-REVIEW' | 'FAIL';
