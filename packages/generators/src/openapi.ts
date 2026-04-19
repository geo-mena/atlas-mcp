import type { MergedFact } from '@atlas/shared';
import { stringify as toYaml } from 'yaml';

export interface OpenApiOptions {
  readonly runId: string;
  readonly title?: string;
  readonly version?: string;
}

export interface OpenApiResult {
  readonly yaml: string;
  readonly path_count: number;
  readonly schema_count: number;
}

/**
 * emitOpenApi — derive an OpenAPI 3.1 spec from merged_facts.
 *
 * Day 5 v0.1 scope:
 *   - Paths from `route` facts, grouped by path
 *   - Operations carry summary (from controller_action), x-atlas-evidence,
 *     and a request body inferred from payload_field facts when available
 *   - Component schemas from `field_definition` facts
 *   - Responses are stubbed with status codes seen in `http_response` facts
 */
export function emitOpenApi(facts: readonly MergedFact[], options: OpenApiOptions): OpenApiResult {
  const routes = filterByType(facts, 'route');
  const controllers = filterByType(facts, 'controller_action');
  const payloadFields = filterByType(facts, 'payload_field');
  const httpResponses = filterByType(facts, 'http_response');
  const fieldDefs = filterByType(facts, 'field_definition');

  const paths = buildPaths(routes, controllers, payloadFields, httpResponses);
  const schemas = buildSchemas(fieldDefs);

  const document: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'Atlas-generated API',
      version: options.version ?? '0.1.0-alpha.0',
      'x-atlas-run-id': options.runId,
    },
    paths,
  };
  if (Object.keys(schemas).length > 0) {
    document['components'] = { schemas };
  }

  return {
    yaml: toYaml(document, { lineWidth: 0 }),
    path_count: Object.keys(paths).length,
    schema_count: Object.keys(schemas).length,
  };
}

function filterByType(facts: readonly MergedFact[], type: string): MergedFact[] {
  return facts.filter((f) => f.fact_type === type);
}

function buildPaths(
  routes: readonly MergedFact[],
  controllers: readonly MergedFact[],
  payloadFields: readonly MergedFact[],
  httpResponses: readonly MergedFact[],
): Record<string, Record<string, unknown>> {
  const controllersByName = indexBy(controllers, (f) => `${str(f.content, 'class')}@${str(f.content, 'method')}`);
  const fieldsByEndpoint = groupBy(payloadFields, (f) => str(f.content, 'endpoint'));
  const responsesByEndpoint = groupBy(httpResponses, (f) =>
    `${str(f.content, 'method').toUpperCase()} ${str(f.content, 'url').toLowerCase()}`,
  );

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const method = str(route.content, 'method').toLowerCase();
    const path = str(route.content, 'path');
    const controllerKey = str(route.content, 'controller');
    if (path === '' || method === '') continue;

    paths[path] ??= {};
    const operation: Record<string, unknown> = {
      summary: controllerKey || `${method.toUpperCase()} ${path}`,
      'x-atlas-evidence': {
        source_fact_ids: route.source_fact_ids,
        winning_source: route.winning_source,
        resolution: route.resolution,
      },
    };

    const controller = controllersByName.get(controllerKey);
    if (controller) {
      const params = asStringArray(controller.content['params']);
      if (params.length > 0) {
        operation['x-atlas-controller-params'] = params;
      }
    }

    const requestBody = buildRequestBody(fieldsByEndpoint.get(`${method.toUpperCase()} ${path}`));
    if (requestBody !== null) {
      operation['requestBody'] = requestBody;
    }

    const responses = buildResponses(responsesByEndpoint.get(`${method.toUpperCase()} ${path}`));
    operation['responses'] = responses;

    paths[path][method] = operation;
  }
  return paths;
}

function buildRequestBody(fields: readonly MergedFact[] | undefined): Record<string, unknown> | null {
  if (!fields || fields.length === 0) return null;
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    const name = str(field.content, 'field');
    if (name === '') continue;
    properties[name] = { type: jsonSchemaType(str(field.content, 'type')) };
  }
  if (Object.keys(properties).length === 0) return null;
  return {
    required: true,
    content: {
      'application/x-www-form-urlencoded': {
        schema: { type: 'object', properties },
      },
    },
  };
}

function buildResponses(responses: readonly MergedFact[] | undefined): Record<string, Record<string, string>> {
  if (!responses || responses.length === 0) {
    return { '200': { description: 'OK' } };
  }
  const seen = new Set<string>();
  const out: Record<string, Record<string, string>> = {};
  for (const r of responses) {
    const status = String(r.content['status'] ?? '200');
    if (seen.has(status)) continue;
    seen.add(status);
    out[status] = { description: defaultDescriptionFor(status) };
  }
  return out;
}

function buildSchemas(fields: readonly MergedFact[]): Record<string, Record<string, unknown>> {
  if (fields.length === 0) return {};
  const schema: Record<string, Record<string, unknown>> = {};
  for (const f of fields) {
    const name = str(f.content, 'name');
    if (name === '') continue;
    const property: Record<string, unknown> = { type: jsonSchemaType(str(f.content, 'type')) };
    const format = str(f.content, 'format');
    if (format !== '') property['format'] = format;
    if (f.content['required'] === true) property['x-atlas-required'] = true;
    property['x-atlas-evidence'] = {
      source_fact_ids: f.source_fact_ids,
      winning_source: f.winning_source,
      resolution: f.resolution,
    };
    schema[name] = property;
  }
  return schema;
}

function jsonSchemaType(declared: string): string {
  switch (declared.toLowerCase()) {
    case 'integer':
    case 'int':
      return 'integer';
    case 'decimal':
    case 'float':
    case 'number':
    case 'numeric':
      return 'number';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'array':
    case 'list':
      return 'array';
    case 'object':
    case 'dict':
    case 'map':
      return 'object';
    default:
      return 'string';
  }
}

function defaultDescriptionFor(status: string): string {
  const code = Number.parseInt(status, 10);
  if (code >= 200 && code < 300) return 'OK';
  if (code === 302) return 'Redirect';
  if (code >= 400 && code < 500) return 'Client error';
  if (code >= 500) return 'Server error';
  return `Status ${status}`;
}

function indexBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return map;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const existing = map.get(k);
    if (existing) {
      existing.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}

function str(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
