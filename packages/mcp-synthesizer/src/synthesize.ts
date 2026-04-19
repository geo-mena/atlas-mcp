import type { Scratchpad } from '@atlas/mcp-scratchpad';

import { synthesizeDrafts } from './policy.js';

export interface SynthesisResult {
    readonly run_id: string;
    readonly source_fact_count: number;
    readonly merged_count: number;
    readonly resolutions: Readonly<Record<string, number>>;
    readonly unresolved_count: number;
}

/**
 * synthesize — read all facts for a run, group by logicalKey, resolve each
 * group, replace any prior merged_facts for the run, and persist the new set.
 *
 * The replace-then-insert pattern makes the operation idempotent: re-running
 * synthesize on the same run produces the same merged_facts state, regardless
 * of how many times it was invoked previously.
 */
export function synthesize(scratchpad: Scratchpad, runId: string): SynthesisResult {
    const facts = scratchpad.selectFacts({ run_id: runId });
    const drafts = synthesizeDrafts(facts);

    scratchpad.deleteMergedFacts(runId);
    for (const draft of drafts) {
        scratchpad.insertMergedFact(draft);
    }

    const resolutions: Record<string, number> = {};
    let unresolved = 0;
    for (const draft of drafts) {
        resolutions[draft.resolution] = (resolutions[draft.resolution] ?? 0) + 1;
        if (draft.resolution === 'unresolved') unresolved += 1;
    }

    return {
        run_id: runId,
        source_fact_count: facts.length,
        merged_count: drafts.length,
        resolutions,
        unresolved_count: unresolved,
    };
}
