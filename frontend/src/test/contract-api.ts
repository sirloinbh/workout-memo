// 중앙 관리 파일. 수정은 sirloinbh/project-standards의 templates/msw/frontend/src/test/에서
// Screen tests without the backend (#281): MSW answers every operation in the OpenAPI contract
// (docs/openapi.json) with a sample built from its response schema. Opt in per test file:
//
//   const api = setupContractApi({ emptyBody: [] });
//   api.use(...contractHandlers({ 'GET /api/goals': [{ id: 1, exercise: '스쿼트' }] }));
//
// When the contract gives a success response no JSON schema, the body is empty unless emptyBody
// says what to answer (e.g. [] for list screens).
//
// A request the contract does not have fails the test, so a screen cannot call an endpoint the
// backend does not serve.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

import specText from '../../../docs/openapi.json?raw';

export type Schema = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
};
type Media = { schema?: Schema; example?: unknown };
type Operation = { responses?: Record<string, { content?: Record<string, Media> }> };
type Spec = {
  paths: Record<string, Partial<Record<Method, Operation>>>;
  components?: { schemas?: Record<string, Schema> };
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];
export type ContractOverrides = Partial<Record<`${Uppercase<Method>} /${string}`, unknown>>;
export type ContractOptions = { emptyBody?: unknown };

const spec = JSON.parse(specText) as Spec;

/** A value that satisfies the schema: its example or first enum value, else the smallest value of its type. */
export function sample(
  schema: Schema | undefined,
  components = spec.components?.schemas ?? {},
  depth = 0,
): unknown {
  if (!schema || depth > 10) return null;
  if (schema.$ref)
    return sample(
      components[schema.$ref.replace('#/components/schemas/', '')],
      components,
      depth + 1,
    );
  if (schema.example !== undefined) return schema.example;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.allOf)
    return Object.assign({}, ...schema.allOf.map((s) => sample(s, components, depth + 1)));
  const choices = schema.oneOf ?? schema.anyOf;
  if (choices?.length)
    return sample(choices.find((s) => s.type !== 'null') ?? choices[0], components, depth + 1);
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null')
    : (schema.type ?? (schema.properties ? 'object' : undefined));
  switch (type) {
    case 'object':
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, s]) => [
          key,
          sample(s, components, depth + 1),
        ]),
      );
    case 'array':
      return [];
    case 'string':
      if (schema.format === 'date') return '2026-01-01';
      if (schema.format === 'date-time') return '2026-01-01T00:00:00.000Z';
      return '';
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
}

/** The first 2xx response of an operation: JSON from its example or schema, other media empty, else emptyBody or nothing. */
function contractResponse(operation: Operation, { emptyBody }: ContractOptions) {
  const [status, response] = Object.entries(operation.responses ?? {}).find(([code]) =>
    /^2\d\d$/.test(code),
  ) ?? ['200', {}];
  const init = { status: Number(status) };
  const json = response.content?.['application/json'];
  if (json) return () => HttpResponse.json((json.example ?? sample(json.schema)) as never, init);
  const media = Object.keys(response.content ?? {})[0];
  if (media) return () => new HttpResponse('', { ...init, headers: { 'Content-Type': media } });
  if (emptyBody !== undefined) return () => HttpResponse.json(emptyBody as never, init);
  return () => new HttpResponse(null, init);
}

/** One handler per contract operation; overrides replace the JSON body of "METHOD /path" (path as in the contract). */
export function contractHandlers(overrides: ContractOverrides = {}, options: ContractOptions = {}) {
  const custom = overrides as Record<string, unknown>;
  return Object.entries(spec.paths).flatMap(([path, operations]) =>
    METHODS.filter((method) => operations[method]).map((method) => {
      const key = `${method.toUpperCase()} ${path}`;
      const resolver =
        key in custom
          ? () => HttpResponse.json(custom[key] as never)
          : contractResponse(operations[method]!, options);
      return http[method](path.replace(/\{([^}]+)\}/g, ':$1'), resolver);
    }),
  );
}

export const contractServer = setupServer();

const unhandled: string[] = [];
/** Requests outside the contract since the last call; setupContractApi fails a test that leaves any. */
export function takeUnhandledRequests() {
  return unhandled.splice(0);
}

/** Starts the contract mock for the calling test file and resets per-test overrides after each test. */
export function setupContractApi(options: ContractOptions = {}) {
  // resetHandlers() without arguments would drop back to setupServer()'s empty list, so the
  // contract handlers are passed again after every test.
  const base = contractHandlers({}, options);
  contractServer.resetHandlers(...base);
  // The rejected fetch alone is not enough: a screen that catches fetch errors would hide it.
  // Unhandled requests are collected and fail the test after it ends.
  beforeAll(() =>
    contractServer.listen({
      onUnhandledFrame: async ({ frame, defaults }) => {
        unhandled.push(await frame.getUnhandledMessage());
        defaults.error();
      },
    }),
  );
  afterEach(() => {
    contractServer.resetHandlers(...base);
    const found = takeUnhandledRequests();
    if (found.length) throw new Error(`계약(docs/openapi.json)에 없는 요청:\n${found.join('\n')}`);
  });
  afterAll(() => contractServer.close());
  return contractServer;
}
