/**
 * @atlas/mcp-synthesizer — public API. Side-effect free.
 *
 * Server boot lives in bin.ts.
 */

export { SynthesizerError, type SynthesizerErrorCode } from './errors.js';
export { logicalKey, groupByKey, resolveGroup, synthesizeDrafts } from './policy.js';
export { synthesize, type SynthesisResult } from './synthesize.js';
export { buildServer } from './server.js';
export { runSynthesize, listMergedFacts, listConflicts, type ToolsConfig } from './tools.js';
