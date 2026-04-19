import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ScratchpadError } from '@atlas/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Scratchpad } from '../src/db.js';
import { readFacts, writeFact } from '../src/tools.js';

describe('mcp-scratchpad tools', () => {
    let tmp: string;
    let scratchpad: Scratchpad;

    beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), 'atlas-tools-'));
        scratchpad = new Scratchpad(join(tmp, 'test.sqlite'));
        scratchpad.migrate();
    });

    afterEach(() => {
        scratchpad.close();
        rmSync(tmp, { recursive: true, force: true });
    });

    const wellFormed = {
        run_id: 'run-x',
        source_agent: 'code-spelunker',
        fact_type: 'route',
        content: { method: 'GET', path: '/' },
        evidence_uri: 'file://x',
        confidence: 'high',
    };

    it('writeFact accepts a well-formed fact', () => {
        const { id } = writeFact(scratchpad, wellFormed);
        expect(id).toBeGreaterThan(0);
    });

    it('writeFact rejects missing source_agent (cross-agent invariant)', () => {
        const { source_agent: _omit, ...rest } = wellFormed;
        expect(() => writeFact(scratchpad, rest)).toThrow(ScratchpadError);
    });

    it('writeFact rejects missing evidence_uri (cross-agent invariant)', () => {
        const { evidence_uri: _omit, ...rest } = wellFormed;
        expect(() => writeFact(scratchpad, rest)).toThrow(ScratchpadError);
    });

    it('writeFact rejects missing confidence (cross-agent invariant)', () => {
        const { confidence: _omit, ...rest } = wellFormed;
        expect(() => writeFact(scratchpad, rest)).toThrow(ScratchpadError);
    });

    it('writeFact rejects unknown source_agent', () => {
        expect(() => writeFact(scratchpad, { ...wellFormed, source_agent: 'rogue' })).toThrow(
            ScratchpadError,
        );
    });

    it('writeFact rejects unknown confidence value', () => {
        expect(() => writeFact(scratchpad, { ...wellFormed, confidence: 'maybe' })).toThrow(
            ScratchpadError,
        );
    });

    it('readFacts roundtrips a written fact', () => {
        writeFact(scratchpad, wellFormed);
        const facts = readFacts(scratchpad, { run_id: 'run-x' });
        expect(facts).toHaveLength(1);
        expect(facts[0]?.content).toEqual({ method: 'GET', path: '/' });
    });

    it('ScratchpadError carries an INVARIANT_VIOLATION code', () => {
        try {
            writeFact(scratchpad, { run_id: 'r', source_agent: 'code-spelunker' });
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(ScratchpadError);
            expect((err as ScratchpadError).code).toBe('INVARIANT_VIOLATION');
        }
    });
});
