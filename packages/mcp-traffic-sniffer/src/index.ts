/**
 * @atlas/mcp-traffic-sniffer — public API. Side-effect free.
 *
 * Server boot lives in bin.ts.
 */

export { Proxy, type ProxyConfig, type Spawner } from './proxy.js';
export { ProxyRegistry } from './registry.js';
export { TrafficSnifferError, type TrafficSnifferErrorCode } from './errors.js';
export {
    parseHar,
    readHarFile,
    entriesByEndpoint,
    summarizeHar,
    type HarEntry,
    type HarFile,
    type HarHeader,
    type HarRequest,
    type HarResponse,
} from './har.js';
export {
    startProxy,
    stopProxy,
    dumpHar,
    type StartProxyResult,
    type StopProxyResult,
    type DumpHarResult,
    type ToolsConfig,
} from './tools.js';
export { buildServer } from './server.js';
