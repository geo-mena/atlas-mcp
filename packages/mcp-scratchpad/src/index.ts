/**
 * @atlas/mcp-scratchpad — public API.
 *
 * Side-effect free. The server boot lives in bin.ts so importing this
 * package does not start a stdio server.
 */

export { Scratchpad } from './db.js';
export { buildServer } from './server.js';
export { migrate, readFacts, writeFact, type WriteFactResult } from './tools.js';
export type {
    Fact,
    FactInput,
    FactFilter,
    MergedFact,
    MergedFactInput,
    MergedFactFilter,
    Resolution,
} from '@atlas/shared';
