/**
 * @atlas/mcp-fidelity-auditor — public API. Side-effect free.
 *
 * Server boot lives in bin.ts.
 */

export { AuditorError, type AuditorErrorCode } from './errors.js';
export {
  normalize,
  type ContentType,
  type NormalizationConfig,
  type NormalizationRule,
  type NormalizedPayload,
} from './normalize.js';
export { runDiff, type DiffChange, type DiffResult } from './diff.js';
export {
  classify,
  aggregateRunVerdict,
  type ClassifyOptions,
  type ScenarioClassification,
} from './classify.js';
export {
  auditScenarios,
  type AuditOptions,
  type AuditResult,
  type ResponseBody,
  type ScenarioInput,
  type ScenarioResult,
} from './audit.js';
export { writeReports, type ReportPaths } from './report.js';
export { runAudit, type AuditToolResult } from './tools.js';
export { buildServer } from './server.js';
