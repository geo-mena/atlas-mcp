import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { z, ZodError } from 'zod';

import { TrafficSnifferError } from './errors.js';
import { entriesByEndpoint, readHarFile } from './har.js';
import { Proxy, type Spawner } from './proxy.js';
import type { ProxyRegistry } from './registry.js';

const StartProxyInputSchema = z.object({
  run_id: z.string().min(1),
  upstream_url: z.string().url().optional(),
});

const StopProxyInputSchema = z.object({
  run_id: z.string().min(1),
});

const DumpHarInputSchema = z.object({
  run_id: z.string().min(1),
});

export interface StartProxyResult {
  readonly proxy_port: number;
  readonly proxy_url: string;
  readonly har_path: string;
}

export interface StopProxyResult {
  readonly stopped: boolean;
  readonly har_path: string;
}

export interface DumpHarResult {
  readonly har_path: string;
  readonly entry_count: number;
  readonly endpoint_count: number;
  readonly endpoints: readonly string[];
}

export interface ToolsConfig {
  readonly runsRoot: string;
  readonly portAllocator: () => number;
  readonly spawner?: Spawner;
}

export function startProxy(registry: ProxyRegistry, config: ToolsConfig, raw: unknown): StartProxyResult {
  const input = parseOrThrow(StartProxyInputSchema, raw);
  const port = config.portAllocator();
  const harPath = join(config.runsRoot, input.run_id, 'golden.har');
  mkdirSync(dirname(harPath), { recursive: true });

  const proxy = new Proxy({ runId: input.run_id, listenPort: port, harPath }, config.spawner);
  proxy.start();
  registry.register(input.run_id, proxy);

  return { proxy_port: port, proxy_url: `http://localhost:${port}`, har_path: harPath };
}

export function stopProxy(registry: ProxyRegistry, raw: unknown): StopProxyResult {
  const input = parseOrThrow(StopProxyInputSchema, raw);
  const proxy = registry.get(input.run_id);
  proxy.stop();
  const harPath = proxy.harPath();
  registry.remove(input.run_id);
  return { stopped: true, har_path: harPath };
}

export function dumpHar(registry: ProxyRegistry, raw: unknown): DumpHarResult {
  const input = parseOrThrow(DumpHarInputSchema, raw);
  const proxy = registry.get(input.run_id);
  const har = readHarFile(proxy.harPath());
  const grouped = entriesByEndpoint(har);
  return {
    har_path: proxy.harPath(),
    entry_count: har.log.entries.length,
    endpoint_count: grouped.size,
    endpoints: [...grouped.keys()],
  };
}

function parseOrThrow<T>(
  schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
  raw: unknown,
): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new TrafficSnifferError('INVALID_INPUT', `invalid input: ${issues}`);
}
