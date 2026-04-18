#!/usr/bin/env node
/**
 * @atlas/mcp-traffic-sniffer — Atlas traffic sniffer MCP server.
 *
 * Day 0 skeleton. Implementation lands Day 2.
 *
 * Tools (planned):
 *   start_proxy({ run_id, upstream_url }) → { proxy_port }
 *   stop_proxy({ run_id }) → void
 *   tail_events({ run_id, since_index }) → ProxyEvent[]
 *   dump_har({ run_id }) → { har_path }
 *   redact({ run_id, rules }) → void
 *
 * Implementation: spawn mitmproxy as subprocess, additionally hook Playwright
 * network events for DOM correlation. mitmproxy is a Python binary external
 * dep; the MCP server only invokes it.
 */

// TODO Day 2: spawn mitmproxy subprocess with addon for event streaming.
// TODO Day 2: HAR dump + nock cassette generation post-run.
// TODO Day 2: chunked transfer / WS / SSE detection and HUMAN-REVIEW flagging.

export {};
