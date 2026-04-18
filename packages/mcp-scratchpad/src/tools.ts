import {
  FactFilterSchema,
  FactInputSchema,
  ScratchpadError,
  type Fact,
  type FactFilter,
  type FactInput,
} from '@atlas/shared';
import { ZodError } from 'zod';

import type { Scratchpad } from './db.js';

export interface WriteFactResult {
  readonly id: number;
}

export function writeFact(scratchpad: Scratchpad, raw: unknown): WriteFactResult {
  const input = parseOrThrow(FactInputSchema, raw);
  const id = scratchpad.insertFact(input);
  return { id };
}

export function readFacts(scratchpad: Scratchpad, raw: unknown): Fact[] {
  const filter = parseOrThrow(FactFilterSchema, raw);
  return scratchpad.selectFacts(filter);
}

export function migrate(scratchpad: Scratchpad): void {
  scratchpad.migrate();
}

function parseOrThrow<T>(
  schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
  raw: unknown,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new ScratchpadError('INVARIANT_VIOLATION', formatZodError(result.error));
}

function formatZodError(err: ZodError): string {
  const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return `invalid input: ${issues.join('; ')}`;
}

// Re-export the input shapes so callers (smoke tests, future generators) can
// build payloads without reaching into @atlas/shared directly.
export { FactInputSchema, FactFilterSchema };
export type { Fact, FactInput, FactFilter };
