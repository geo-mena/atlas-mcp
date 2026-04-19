import { describe, expect, it } from 'vitest';

import { AuditorError } from '../src/errors.js';
import { normalize } from '../src/normalize.js';

describe('normalize JSON', () => {
    it('sorts keys deterministically', () => {
        const a = normalize('{"b":1,"a":2}', 'application/json');
        const b = normalize('{"a":2,"b":1}', 'application/json');
        expect(a.text).toBe(b.text);
        expect(a.text).toBe('{"a":2,"b":1}');
    });

    it('scrubs configured JSON paths', () => {
        const out = normalize('{"timestamp":"2026-04-18","amount":100}', 'application/json', {
            scrub_paths: ['$.timestamp'],
        });
        expect(out.text).toContain('"timestamp":"<scrubbed>"');
        expect(out.text).toContain('"amount":100');
        expect(out.applied_rules).toContain('scrub:$.timestamp');
    });

    it('applies regex masks', () => {
        const out = normalize('{"sequence":"VE-1234567890"}', 'application/json', {
            masks: [{ pattern: 'VE-\\d+', replacement: 'VE-<n>' }],
        });
        expect(out.text).toContain('"sequence":"VE-<n>"');
    });

    it('throws AuditorError on malformed JSON', () => {
        try {
            normalize('not json', 'application/json');
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AuditorError);
            expect((err as AuditorError).code).toBe('NORMALIZATION_FAILED');
        }
    });
});

describe('normalize XML', () => {
    it('collapses whitespace between tags', () => {
        const out = normalize('<root>\n  <a/>\n  <b/>\n</root>', 'application/xml');
        expect(out.text).toBe('<root><a/><b/></root>');
    });

    it('scrubs by element name from xpath hint', () => {
        const out = normalize(
            '<envelope><control>VE-100</control><amount>10</amount></envelope>',
            'application/xml',
            { scrub_paths: ['//control'] },
        );
        expect(out.text).toContain('<control><scrubbed/></control>');
        expect(out.text).toContain('<amount>10</amount>');
    });
});

describe('normalize text', () => {
    it('trims trailing whitespace and normalizes line endings', () => {
        const out = normalize('a   \r\nb\t\nc', 'text/plain');
        expect(out.text).toBe('a\nb\nc');
    });
});

describe('normalize HTML', () => {
    it('parses and collapses whitespace', () => {
        const out = normalize('<html><body>   <p>hi</p>   </body></html>', 'text/html');
        expect(out.text.includes('<p>hi</p>')).toBe(true);
        expect(out.applied_rules).toContain('parse5_canonical');
    });
});
