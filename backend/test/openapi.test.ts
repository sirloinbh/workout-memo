import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { goalSchema, workoutSchema } from '../src/domain.js';
import { buildOpenApi, jsonSchema, registeredRoutes, routeDescriptions } from '../src/openapi.js';

const docs = new URL('../../docs/', import.meta.url);
const app = () => createApp({} as Pool);
async function built() {
  return buildOpenApi(app(), routeDescriptions(await readFile(new URL('api.md', docs), 'utf8')));
}

test('docs/openapi.json is up to date with the routes, schemas and docs/api.md', async () => {
  const committed = JSON.parse(await readFile(new URL('openapi.json', docs), 'utf8'));
  assert.deepEqual(committed, await built(), 'run `npm run openapi` and commit the result');
});

test('every registered route is one documented operation with a summary', async () => {
  const spec = await built();
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ route: `${method} ${path}`, op })),
  );
  assert.equal(operations.length, registeredRoutes(app()).length);
  for (const { route, op } of operations)
    assert.ok((op as { summary: string }).summary, `${route} has a docs/api.md description`);
  const del = spec.paths['/api/routines/{id}/rests/{date}'].delete as {
    parameters: { name: string; schema: { type: string; pattern?: string } }[];
  };
  assert.deepEqual(
    del.parameters.map((p) => p.name),
    ['id', 'date'],
  );
  assert.equal(del.parameters[1].schema.pattern, '^\\d{4}-\\d{2}-\\d{2}$');
});

test('request schemas keep the server constraints for sets and goals', () => {
  const workout = jsonSchema(workoutSchema) as {
    required: string[];
    properties: {
      sets: {
        minItems: number;
        maxItems: number;
        items: { properties: Record<string, unknown>; required: string[] };
      };
    };
  };
  assert.deepEqual(workout.required, ['date', 'title', 'sets']);
  const sets = workout.properties.sets;
  assert.equal(sets.minItems, 1);
  assert.equal(sets.maxItems, 200);
  assert.deepEqual(sets.items.required, ['exercise', 'weight', 'reps']);
  assert.deepEqual(sets.items.properties.weight, { type: 'number', minimum: 0, maximum: 99999 });
  assert.deepEqual(sets.items.properties.reps, { type: 'integer', minimum: 1, maximum: 1000 });
  assert.deepEqual(sets.items.properties.rpe, {
    type: ['number', 'null'],
    minimum: 1,
    maximum: 10,
    default: null,
  });
  assert.deepEqual(sets.items.properties.completed, { type: 'boolean', default: true });
  const goal = jsonSchema(goalSchema) as { required: string[] };
  assert.deepEqual(goal.required, [
    'exercise',
    'target_weight',
    'target_reps',
    'start_date',
    'deadline',
  ]);
});

test('unsupported schemas and undocumented routes fail instead of being skipped', () => {
  assert.throws(() => jsonSchema(z.date()), /Unsupported Zod type for OpenAPI: ZodDate/);
  const extended = app();
  extended.get('/api/undocumented', (_req, res) => void res.json({}));
  assert.throws(() => buildOpenApi(extended, {}), /\+GET \/api\/undocumented/);
});
