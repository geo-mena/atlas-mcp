import diff from 'microdiff';

import type { NormalizedPayload } from './normalize.js';

export interface DiffChange {
  readonly type: 'CREATE' | 'REMOVE' | 'CHANGE';
  readonly path: readonly (string | number)[];
  readonly old?: unknown;
  readonly new?: unknown;
}

export interface DiffResult {
  readonly equal: boolean;
  readonly content_type: string;
  readonly changes: readonly DiffChange[];
  /** Free-form summary used when content is not structured (text/html/binary). */
  readonly summary: string;
}

/**
 * runDiff — pure deterministic diff between a normalized legacy payload
 * and a normalized candidate payload of the same content type.
 *
 * For JSON: structural diff via microdiff.
 * For XML / HTML / text / binary: text-equality on the normalized form.
 *   Mismatches are reported as a single CHANGE entry with path = [].
 */
export function runDiff(legacy: NormalizedPayload, candidate: NormalizedPayload): DiffResult {
  if (legacy.content_type !== candidate.content_type) {
    return {
      equal: false,
      content_type: legacy.content_type,
      changes: [
        {
          type: 'CHANGE',
          path: ['content_type'],
          old: legacy.content_type,
          new: candidate.content_type,
        },
      ],
      summary: `content_type mismatch: ${legacy.content_type} vs ${candidate.content_type}`,
    };
  }

  if (legacy.content_type === 'application/json') {
    return diffJson(legacy, candidate);
  }

  return diffText(legacy, candidate);
}

function diffJson(legacy: NormalizedPayload, candidate: NormalizedPayload): DiffResult {
  const a = legacy.parsed;
  const b = candidate.parsed;
  if (!isPlainContainer(a) || !isPlainContainer(b)) {
    // Falls back to text equality if the parsed form was unexpectedly missing.
    return diffText(legacy, candidate);
  }
  const raw = diff(a, b);
  const changes: DiffChange[] = raw.map((c) => ({
    type: c.type,
    path: c.path,
    ...('oldValue' in c ? { old: c.oldValue } : {}),
    ...('value' in c ? { new: c.value } : {}),
  }));
  return {
    equal: changes.length === 0,
    content_type: legacy.content_type,
    changes,
    summary: changes.length === 0 ? 'equal' : `${changes.length} JSON change(s)`,
  };
}

function diffText(legacy: NormalizedPayload, candidate: NormalizedPayload): DiffResult {
  if (legacy.text === candidate.text) {
    return {
      equal: true,
      content_type: legacy.content_type,
      changes: [],
      summary: 'equal',
    };
  }
  return {
    equal: false,
    content_type: legacy.content_type,
    changes: [
      {
        type: 'CHANGE',
        path: [],
        old: legacy.text,
        new: candidate.text,
      },
    ],
    summary: `text mismatch (${legacy.text.length} vs ${candidate.text.length} chars)`,
  };
}

function isPlainContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  if (value === null || typeof value !== 'object') return false;
  return true;
}
