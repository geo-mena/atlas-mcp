import { readFileSync } from 'node:fs';

import { TrafficSnifferError } from './errors.js';

export interface HarHeader {
    readonly name: string;
    readonly value: string;
}

export interface HarRequest {
    readonly method: string;
    readonly url: string;
    readonly httpVersion: string;
    readonly headers: readonly HarHeader[];
    readonly postData?: { readonly mimeType: string; readonly text?: string };
}

export interface HarResponse {
    readonly status: number;
    readonly statusText: string;
    readonly httpVersion: string;
    readonly headers: readonly HarHeader[];
    readonly content: { readonly size: number; readonly mimeType: string; readonly text?: string };
}

export interface HarEntry {
    readonly startedDateTime: string;
    readonly time: number;
    readonly request: HarRequest;
    readonly response: HarResponse;
}

export interface HarFile {
    readonly log: { readonly version: string; readonly entries: readonly HarEntry[] };
}

export function parseHar(text: string): HarFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TrafficSnifferError('HAR_PARSE_ERROR', `not valid JSON: ${message}`);
    }
    if (!isHarFile(parsed)) {
        throw new TrafficSnifferError(
            'HAR_PARSE_ERROR',
            'JSON does not match HAR shape (missing log.entries)',
        );
    }
    return parsed;
}

export function readHarFile(path: string): HarFile {
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TrafficSnifferError('HAR_NOT_FOUND', `cannot read HAR at ${path}: ${message}`);
    }
    return parseHar(text);
}

export function summarizeHar(entries: readonly HarEntry[]): {
    count: number;
    methods: Record<string, number>;
} {
    const methods: Record<string, number> = {};
    for (const entry of entries) {
        methods[entry.request.method] = (methods[entry.request.method] ?? 0) + 1;
    }
    return { count: entries.length, methods };
}

export function entriesByEndpoint(har: HarFile): Map<string, HarEntry[]> {
    const grouped = new Map<string, HarEntry[]>();
    for (const entry of har.log.entries) {
        const key = `${entry.request.method} ${stripQuery(entry.request.url)}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.push(entry);
        } else {
            grouped.set(key, [entry]);
        }
    }
    return grouped;
}

function stripQuery(url: string): string {
    const i = url.indexOf('?');
    return i === -1 ? url : url.slice(0, i);
}

function isHarFile(value: unknown): value is HarFile {
    if (typeof value !== 'object' || value === null) return false;
    const log = (value as { log?: unknown }).log;
    if (typeof log !== 'object' || log === null) return false;
    const entries = (log as { entries?: unknown }).entries;
    return Array.isArray(entries);
}
