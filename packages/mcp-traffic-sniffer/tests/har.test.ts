import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TrafficSnifferError } from '../src/errors.js';
import { entriesByEndpoint, parseHar, readHarFile, summarizeHar } from '../src/har.js';

const SAMPLE_HAR = JSON.stringify({
  log: {
    version: '1.2',
    entries: [
      {
        startedDateTime: '2026-04-18T22:08:29.000Z',
        time: 12,
        request: {
          method: 'POST',
          url: 'http://seniat-mock:3001/seniat-mock/authorize',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'content-type', value: 'application/xml' }],
          postData: { mimeType: 'application/xml', text: '<envelope/>' },
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'content-type', value: 'application/xml' }],
          content: { size: 256, mimeType: 'application/xml', text: '<authorization/>' },
        },
      },
      {
        startedDateTime: '2026-04-18T22:08:30.000Z',
        time: 5,
        request: {
          method: 'GET',
          url: 'http://app:80/ve/invoice?id=5',
          httpVersion: 'HTTP/1.1',
          headers: [],
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [],
          content: { size: 1024, mimeType: 'text/html' },
        },
      },
    ],
  },
});

describe('parseHar', () => {
  it('parses a well-formed HAR document', () => {
    const har = parseHar(SAMPLE_HAR);
    expect(har.log.entries).toHaveLength(2);
    expect(har.log.entries[0]?.request.method).toBe('POST');
  });

  it('rejects non-JSON input', () => {
    try {
      parseHar('not json');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TrafficSnifferError);
      expect((err as TrafficSnifferError).code).toBe('HAR_PARSE_ERROR');
    }
  });

  it('rejects JSON missing log.entries', () => {
    try {
      parseHar(JSON.stringify({ log: {} }));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as TrafficSnifferError).code).toBe('HAR_PARSE_ERROR');
    }
  });
});

describe('readHarFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'atlas-har-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads from disk when present', () => {
    const path = join(tmp, 'out.har');
    writeFileSync(path, SAMPLE_HAR, 'utf8');
    const har = readHarFile(path);
    expect(har.log.entries).toHaveLength(2);
  });

  it('throws HAR_NOT_FOUND when file absent', () => {
    try {
      readHarFile(join(tmp, 'missing.har'));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as TrafficSnifferError).code).toBe('HAR_NOT_FOUND');
    }
  });
});

describe('entriesByEndpoint', () => {
  it('groups entries by method+path (query stripped)', () => {
    const har = parseHar(SAMPLE_HAR);
    const grouped = entriesByEndpoint(har);
    expect([...grouped.keys()].sort()).toEqual([
      'GET http://app:80/ve/invoice',
      'POST http://seniat-mock:3001/seniat-mock/authorize',
    ]);
  });
});

describe('summarizeHar', () => {
  it('counts entries by HTTP method', () => {
    const har = parseHar(SAMPLE_HAR);
    const summary = summarizeHar(har.log.entries);
    expect(summary.count).toBe(2);
    expect(summary.methods).toEqual({ POST: 1, GET: 1 });
  });
});
