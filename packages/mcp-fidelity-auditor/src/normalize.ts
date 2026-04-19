import { parse as parseHtml, serialize as serializeHtml } from 'parse5';

import { AuditorError } from './errors.js';

export type ContentType =
  | 'application/json'
  | 'application/xml'
  | 'text/xml'
  | 'text/html'
  | 'text/plain'
  | 'text/csv'
  | 'application/pdf'
  | 'application/octet-stream';

export interface NormalizationRule {
  /** Regex applied to the rendered string. Matched substrings are replaced. */
  readonly pattern: string;
  readonly replacement: string;
  /** Per-content-type scope. Empty means "all content types". */
  readonly content_types?: readonly ContentType[];
}

export interface NormalizationConfig {
  /** Field paths (JSON: $.path; XML: //element) whose values are scrubbed. */
  readonly scrub_paths?: readonly string[];
  /** Regex masks applied to the serialized payload. */
  readonly masks?: readonly NormalizationRule[];
  /** Numeric tolerance applied to JSON numbers. Absolute difference. */
  readonly numeric_tolerance?: number;
}

export interface NormalizedPayload {
  readonly content_type: ContentType;
  readonly text: string;
  /** Structured representation when applicable (JSON object, parsed XML root). */
  readonly parsed: unknown;
  readonly applied_rules: readonly string[];
}

/**
 * normalize — strip declared noise and produce a deterministic representation
 * the diff layer can compare. Day 6 v0.1 covers JSON, XML (light), HTML, and
 * plain text. PDF and binary fall through to identity normalization with a
 * note recorded in `applied_rules`.
 */
export function normalize(
  body: string,
  contentType: string,
  config: NormalizationConfig = {},
): NormalizedPayload {
  const ct = canonicalizeContentType(contentType);
  switch (ct) {
    case 'application/json':
      return normalizeJson(body, config);
    case 'application/xml':
    case 'text/xml':
      return normalizeXml(body, ct, config);
    case 'text/html':
      return normalizeHtmlPayload(body, config);
    case 'text/plain':
    case 'text/csv':
      return normalizePlainText(body, ct, config);
    case 'application/pdf':
    case 'application/octet-stream':
      return {
        content_type: ct,
        text: body,
        parsed: null,
        applied_rules: ['identity (binary or PDF — full normalization deferred)'],
      };
  }
}

function canonicalizeContentType(raw: string): ContentType {
  const ct = raw.split(';')[0]?.trim().toLowerCase() ?? '';
  switch (ct) {
    case 'application/json':
    case 'application/xml':
    case 'text/xml':
    case 'text/html':
    case 'text/plain':
    case 'text/csv':
    case 'application/pdf':
    case 'application/octet-stream':
      return ct;
    default:
      // Unknown types route through plain-text normalization; the diff layer
      // will still classify mismatches as FAIL on inequality.
      return 'text/plain';
  }
}

function normalizeJson(body: string, config: NormalizationConfig): NormalizedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuditorError('NORMALIZATION_FAILED', `JSON parse error: ${message}`);
  }
  const applied: string[] = [];

  parsed = scrubJsonPaths(parsed, config.scrub_paths ?? [], applied);
  parsed = sortJsonKeys(parsed);
  applied.push('sort_keys');

  let text = JSON.stringify(parsed);
  text = applyMasks(text, 'application/json', config.masks ?? [], applied);

  return { content_type: 'application/json', text, parsed, applied_rules: applied };
}

function normalizeXml(body: string, ct: ContentType, config: NormalizationConfig): NormalizedPayload {
  // Day 6 v0.1: lightweight XML normalization — collapse whitespace between
  // tags, strip XML declaration whitespace, mask scrub-path elements by
  // string substitution. Full C14N (xml-c14n) is wired post-MVP; the diff
  // layer treats this output as text-equivalent for now.
  const applied: string[] = [];

  let normalized = body
    .replace(/<\?xml[^?]*\?>\s*/i, '<?xml version="1.0" encoding="UTF-8"?>')
    .replace(/>\s+</g, '><')
    .trim();
  applied.push('whitespace_collapse');

  for (const path of config.scrub_paths ?? []) {
    const tag = stripXpathToTag(path);
    if (tag === null) continue;
    const re = new RegExp(`(<${escapeRegExp(tag)}[^>]*>)[^<]*(</${escapeRegExp(tag)}>)`, 'gi');
    normalized = normalized.replace(re, '$1<scrubbed/>$2');
    applied.push(`scrub:${tag}`);
  }

  normalized = applyMasks(normalized, ct, config.masks ?? [], applied);

  return { content_type: ct, text: normalized, parsed: null, applied_rules: applied };
}

function normalizeHtmlPayload(body: string, config: NormalizationConfig): NormalizedPayload {
  // parse5's parse/serialize roundtrip canonicalizes the document. We discard
  // the parsed tree (the diff layer compares text for HTML) so the local
  // typing stays narrow.
  const applied: string[] = [];
  let text: string;
  try {
    text = serializeHtml(parseHtml(body));
    applied.push('parse5_canonical');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AuditorError('NORMALIZATION_FAILED', `HTML parse error: ${message}`);
  }

  text = text.replace(/\s+/g, ' ').trim();
  applied.push('whitespace_collapse');

  text = applyMasks(text, 'text/html', config.masks ?? [], applied);

  return { content_type: 'text/html', text, parsed: null, applied_rules: applied };
}

function normalizePlainText(body: string, ct: ContentType, config: NormalizationConfig): NormalizedPayload {
  const applied: string[] = ['trim_trailing_ws', 'normalize_line_endings'];
  let text = body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\uFEFF/, '');

  text = applyMasks(text, ct, config.masks ?? [], applied);

  return { content_type: ct, text, parsed: null, applied_rules: applied };
}

function scrubJsonPaths(value: unknown, paths: readonly string[], applied: string[]): unknown {
  if (paths.length === 0) return value;
  const cloned = clone(value);
  for (const path of paths) {
    const segments = path.replace(/^\$\.?/, '').split('.').filter((s) => s !== '');
    setAtPath(cloned, segments, '<scrubbed>');
    applied.push(`scrub:${path}`);
  }
  return cloned;
}

function setAtPath(obj: unknown, segments: readonly string[], replacement: unknown): void {
  if (segments.length === 0 || obj === null || typeof obj !== 'object') return;
  const [head, ...rest] = segments;
  if (head === undefined) return;
  if (rest.length === 0) {
    (obj as Record<string, unknown>)[head] = replacement;
    return;
  }
  setAtPath((obj as Record<string, unknown>)[head], rest, replacement);
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const [k, v] of entries) result[k] = sortJsonKeys(v);
    return result;
  }
  return value;
}

function applyMasks(
  text: string,
  contentType: ContentType,
  rules: readonly NormalizationRule[],
  applied: string[],
): string {
  let out = text;
  for (const rule of rules) {
    if (rule.content_types !== undefined && !rule.content_types.includes(contentType)) continue;
    try {
      out = out.replace(new RegExp(rule.pattern, 'g'), rule.replacement);
      applied.push(`mask:${rule.pattern}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AuditorError('NORMALIZATION_FAILED', `bad mask pattern "${rule.pattern}": ${message}`);
    }
  }
  return out;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripXpathToTag(xpath: string): string | null {
  const match = /\/\/?([a-zA-Z][\w-]*)/.exec(xpath);
  return match?.[1] ?? null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
