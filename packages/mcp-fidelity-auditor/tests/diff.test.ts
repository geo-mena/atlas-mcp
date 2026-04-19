import { describe, expect, it } from 'vitest';

import { runDiff } from '../src/diff.js';
import { normalize } from '../src/normalize.js';

describe('runDiff JSON', () => {
  it('returns equal=true when normalized payloads match', () => {
    const a = normalize('{"a":1,"b":2}', 'application/json');
    const b = normalize('{"b":2,"a":1}', 'application/json');
    const result = runDiff(a, b);
    expect(result.equal).toBe(true);
    expect(result.changes).toHaveLength(0);
  });

  it('reports structural changes via microdiff', () => {
    const a = normalize('{"name":"alice"}', 'application/json');
    const b = normalize('{"name":"bob"}', 'application/json');
    const result = runDiff(a, b);
    expect(result.equal).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.path).toEqual(['name']);
    expect(result.changes[0]?.old).toBe('alice');
    expect(result.changes[0]?.new).toBe('bob');
  });
});

describe('runDiff text-equivalent paths', () => {
  it('reports content_type mismatch as a change on the content_type path', () => {
    const a = normalize('{}', 'application/json');
    const b = normalize('a', 'text/plain');
    const result = runDiff(a, b);
    expect(result.equal).toBe(false);
    expect(result.changes[0]?.path).toEqual(['content_type']);
  });

  it('returns equal=true for identical normalized text', () => {
    const a = normalize('hello\nworld', 'text/plain');
    const b = normalize('hello\nworld', 'text/plain');
    const result = runDiff(a, b);
    expect(result.equal).toBe(true);
  });

  it('reports a single path=[] change for text mismatches', () => {
    const a = normalize('hello', 'text/plain');
    const b = normalize('hi', 'text/plain');
    const result = runDiff(a, b);
    expect(result.equal).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.path).toEqual([]);
  });
});
