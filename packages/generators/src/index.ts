/**
 * @atlas/generators — public API. Side-effect free.
 *
 * Server boot lives in bin.ts.
 */

export { GeneratorError, type GeneratorErrorCode } from './errors.js';
export { emitOpenApi, type OpenApiOptions, type OpenApiResult } from './openapi.js';
export { emitMcpServer, type McpServerOptions, type McpServerResult } from './mcp-server.js';
export { emitTestSuite, type TestSuiteOptions, type TestSuiteResult } from './test-suite.js';
export { runEmitOpenApi, runEmitMcpServer, runEmitTestSuite, type ToolsConfig } from './tools.js';
export { buildServer } from './server.js';
