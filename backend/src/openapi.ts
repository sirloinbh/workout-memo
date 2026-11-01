// OpenAPI 3.1 document built from the registered Express routes, the docs/api.md
// descriptions and the server's own Zod schemas (#68). `npm run openapi` writes
// docs/openapi.json and a test fails when the committed file is out of date.
import type express from 'express';
import { z } from 'zod/v4';

import { bodyPartMappingSchema } from './analysis.js';
import { exportQuery, restoreRequest } from './backup.js';
import {
  bodyMeasurementSchema,
  date,
  dateRange,
  goalSchema,
  machineSchema,
  officialWeightQuery,
  routineSchema,
  weightStepSchema,
  workoutSchema,
} from './domain.js';
import { analysisQuery } from './routes/analysis.js';
import { goalSuggestionQuery } from './routes/weight-steps.js';

type Json = Record<string, unknown>;

type CheckDef = {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  length?: number;
  value?: number;
  inclusive?: boolean;
};
const checksOf = (def: Json) =>
  ((def.checks ?? []) as { _zod: { def: CheckDef } }[]).map((check) => check._zod.def);

// Converts the Zod 4 types the API uses. Refinements (cross-field rules such as
// "deadline >= start_date") cannot be expressed here and stay described in docs/api.md;
// any other unsupported type fails loudly instead of being silently dropped.
export function jsonSchema(schema: z.ZodType): Json {
  const def = schema._zod.def as unknown as Json & { type: string };
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const required = Object.keys(shape).filter((key) => !shape[key].isOptional());
      const catchall = def.catchall as z.ZodType | undefined;
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])),
        ...(required.length ? { required } : {}),
        ...(catchall?._zod.def.type === 'never' ? { additionalProperties: false } : {}),
      };
    }
    case 'string': {
      // limitLength records its limits in the meta because a refinement cannot express them.
      const { minLength, maxLength } = schema.meta() ?? {};
      const out: Json = {
        type: 'string',
        ...(minLength === undefined ? {} : { minLength }),
        ...(maxLength === undefined ? {} : { maxLength }),
      };
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') out.minLength = check.minimum;
        else if (check.check === 'max_length') out.maxLength = check.maximum;
        else if (check.check === 'length_equals') out.minLength = out.maxLength = check.length;
        else if (check.check === 'string_format' && check.format === 'regex')
          out.pattern = check.pattern!.source;
        // `overwrite` is trim(); `custom` is a refinement.
        else if (check.check !== 'overwrite' && check.check !== 'custom')
          throw new Error(`Unsupported string check: ${check.format ?? check.check}`);
      }
      return out;
    }
    case 'number': {
      const out: Json = { type: 'number' };
      for (const check of checksOf(def)) {
        if (check.check === 'number_format') out.type = 'integer';
        else if (check.check === 'greater_than')
          out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        else if (check.check === 'less_than')
          out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
        else if (check.check === 'multiple_of') out.multipleOf = check.value;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported number check: ${check.check}`);
      }
      return out;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'array': {
      let min: number | undefined;
      let max: number | undefined;
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') min = check.minimum;
        else if (check.check === 'max_length') max = check.maximum;
        else if (check.check === 'length_equals') min = max = check.length;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported array check: ${check.check}`);
      }
      return {
        type: 'array',
        items: jsonSchema(def.element as z.ZodType),
        ...(min !== undefined ? { minItems: min } : {}),
        ...(max !== undefined ? { maxItems: max } : {}),
      };
    }
    case 'enum':
      return { type: 'string', enum: Object.values(def.entries as Record<string, string>) };
    case 'nullable': {
      const inner = jsonSchema(def.innerType as z.ZodType);
      return typeof inner.type === 'string'
        ? { ...inner, type: [inner.type, 'null'] }
        : { anyOf: [inner, { type: 'null' }] };
    }
    case 'optional':
      return jsonSchema(def.innerType as z.ZodType);
    case 'default':
      return { ...jsonSchema(def.innerType as z.ZodType), default: def.defaultValue };
    case 'unknown':
      return {};
    default:
      throw new Error(`Unsupported Zod type for OpenAPI: ${def.type}`);
  }
}

type Operation = {
  body?: [name: string, schema: z.ZodType];
  query?: z.ZodType;
  // Success status first; the rest are documented error statuses.
  status: number[];
  produces?: string;
  idempotencyKey?: boolean;
};
const restBody = z.object({ date });
// Every registered route must appear here exactly once (checked when building).
export const operations: Record<string, Operation> = {
  'GET /api/health': { status: [200, 500] },
  'GET /api/brands': { status: [200] },
  'GET /api/official-machine-weights': { query: officialWeightQuery, status: [200, 400] },
  'GET /api/machines': { status: [200] },
  'POST /api/machines': { body: ['Machine', machineSchema], status: [201, 400, 409] },
  'PUT /api/machines/:id': { body: ['Machine', machineSchema], status: [200, 400, 404, 409] },
  'GET /api/workouts': { query: dateRange, status: [200, 400] },
  'POST /api/workouts': {
    body: ['Workout', workoutSchema],
    status: [201, 400, 409],
    idempotencyKey: true,
  },
  'PUT /api/workouts/:id': {
    body: ['Workout', workoutSchema],
    status: [200, 400, 404, 409],
    idempotencyKey: true,
  },
  'DELETE /api/workouts/:id': { status: [200, 404] },
  'GET /api/goals': { status: [200] },
  'POST /api/goals': { body: ['Goal', goalSchema], status: [201, 400] },
  'DELETE /api/goals/:id': { status: [200, 404] },
  'GET /api/routines': { status: [200] },
  'POST /api/routines': { body: ['Routine', routineSchema], status: [201, 400] },
  'GET /api/routines/:id': { status: [200, 404] },
  'GET /api/routine-progress': { status: [200] },
  'POST /api/routines/:id/rests': { body: ['RoutineRest', restBody], status: [201, 200, 404, 409] },
  'DELETE /api/routines/:id/rests/:date': { status: [200, 404, 409] },
  'GET /api/body-measurements': { query: dateRange, status: [200, 400] },
  'POST /api/body-measurements': {
    body: ['BodyMeasurement', bodyMeasurementSchema],
    status: [201, 400, 409],
  },
  'PUT /api/body-measurements/:id': {
    body: ['BodyMeasurement', bodyMeasurementSchema],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/body-measurements/:id': { status: [200, 404] },
  'GET /api/analysis': { query: analysisQuery, status: [200, 400] },
  'GET /api/exercise-body-parts': { status: [200] },
  'PUT /api/exercise-body-parts': {
    body: ['BodyPartMapping', bodyPartMappingSchema],
    status: [200, 400],
  },
  'GET /api/exercise-weight-steps': { status: [200] },
  'PUT /api/exercise-weight-steps': {
    body: ['WeightStep', weightStepSchema],
    status: [200, 400],
  },
  'GET /api/goal-suggestion': { query: goalSuggestionQuery, status: [200, 400] },
  'GET /api/export/workouts.csv': { query: exportQuery, status: [200, 400], produces: 'text/csv' },
  'GET /api/backup': { status: [200] },
  'POST /api/backup/preview': {
    body: ['RestoreRequest', restoreRequest],
    status: [200, 400, 413, 500],
  },
  'POST /api/backup/restore': {
    body: ['RestoreRequest', restoreRequest],
    status: [200, 400, 413, 500],
  },
};

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
export function registeredRoutes(app: express.Express) {
  return (app as unknown as { router: { stack: Layer[] } }).router.stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path}`)
      : [],
  );
}

// "| GET    | `/api/workouts` | 설명 |" rows of docs/api.md, keyed by "GET /api/workouts".
export function routeDescriptions(markdown: string) {
  return Object.fromEntries(
    [
      ...markdown.matchAll(/^\| (GET|POST|PUT|DELETE)\s+\| `(\/api\/[^`]+)`\s+\| (.+?)\s*\|$/gm),
    ].map((m) => [`${m[1]} ${m[2]}`, m[3].replace(/`/g, '')]),
  );
}

const statusText: Record<number, string> = {
  200: '성공',
  201: '생성됨',
  400: '입력 검증 실패 또는 존재하지 않는 참조',
  404: '대상 없음',
  409: '중복·버전 충돌·재시도 키 불일치·날짜 조건 불일치',
  413: '요청 크기 한도 초과',
  500: '서버 오류',
};

export function buildOpenApi(app: express.Express, descriptions: Record<string, string>) {
  const routes = registeredRoutes(app);
  const missing = routes.filter((route) => !operations[route]);
  const extra = Object.keys(operations).filter((route) => !routes.includes(route));
  if (missing.length || extra.length)
    throw new Error(`OpenAPI operations differ from routes: +${missing} -${extra}`);
  const schemas: Json = {
    Error: {
      type: 'object',
      properties: { error: { type: 'string', description: '한국어 오류 메시지' } },
      required: ['error'],
    },
  };
  const paths: Record<string, Json> = {};
  for (const route of [...routes].sort()) {
    const [method, path] = route.split(' ');
    const op = operations[route];
    const parameters: Json[] = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: name === 'id' ? { type: 'integer', minimum: 1 } : jsonSchema(date),
    }));
    if (op.query) {
      const query = jsonSchema(op.query) as { properties: Json; required?: string[] };
      for (const [name, schema] of Object.entries(query.properties))
        parameters.push({ name, in: 'query', required: !!query.required?.includes(name), schema });
    }
    if (op.idempotencyKey)
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        description: '같은 요청을 7일 동안 한 번만 반영하는 재시도 키',
        schema: { type: 'string', format: 'uuid' },
      });
    if (op.body) schemas[op.body[0]] = jsonSchema(op.body[1]);
    const [success, ...failures] = op.status;
    const responses: Json = {
      [success]: {
        description: statusText[success],
        ...(op.produces ? { content: { [op.produces]: { schema: { type: 'string' } } } } : {}),
      },
    };
    for (const status of failures)
      responses[status] =
        status === 200 || status === 201
          ? { description: statusText[status] }
          : {
              description: statusText[status],
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            };
    const key = path.replace(/:(\w+)/g, '{$1}');
    paths[key] ??= {};
    paths[key][method.toLowerCase()] = {
      summary: descriptions[route] ?? '',
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${op.body[0]}` } },
              },
            },
          }
        : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Workout Memo API',
      version: '1.0.0',
      description:
        '개인 운동 일지 API. 날짜는 YYYY-MM-DD(Asia/Seoul), 중량은 기본중량 포함 총중량 kg. 응답 본문과 교차 필드 규칙은 docs/api.md를 참고하세요.',
    },
    servers: [{ url: '/' }],
    paths,
    components: { schemas },
  };
}
