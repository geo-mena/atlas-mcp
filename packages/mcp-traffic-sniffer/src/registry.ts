import { TrafficSnifferError } from './errors.js';
import type { Proxy } from './proxy.js';

/**
 * ProxyRegistry — one Proxy per run_id. The MCP server holds a single
 * registry instance for its lifetime; the orchestrator skill is responsible
 * for stop_proxy on completion so registry entries do not leak.
 */
export class ProxyRegistry {
    private readonly entries = new Map<string, Proxy>();

    register(runId: string, proxy: Proxy): void {
        if (this.entries.has(runId)) {
            throw new TrafficSnifferError(
                'ALREADY_RUNNING',
                `proxy for run ${runId} is already registered`,
            );
        }
        this.entries.set(runId, proxy);
    }

    get(runId: string): Proxy {
        const proxy = this.entries.get(runId);
        if (proxy === undefined) {
            throw new TrafficSnifferError('NOT_RUNNING', `no proxy registered for run ${runId}`);
        }
        return proxy;
    }

    remove(runId: string): void {
        this.entries.delete(runId);
    }

    size(): number {
        return this.entries.size;
    }
}
