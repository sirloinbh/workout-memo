import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { createApp } from '../src/app.js';
import { goalSchema, workoutSchema } from '../src/domain.js';
import { document, operations } from '../src/openapi.js';
import { schemaOf } from '../src/standard/openapi.js';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

// Routes are only registered here, never called, so no database is needed. All routes sit directly on the app.
function registeredRoutes() {
  const app = createApp({} as Pool);
  return (app as unknown as { router: { stack: Layer[] } }).router.stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path}`)
      : [],
  );
}

test('docs/openapi.json is up to date with the operation table and schemas', async () => {
  const committed = JSON.parse(
    await readFile(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
  ) as unknown;
  assert.deepEqual(
    committed,
    JSON.parse(JSON.stringify(document)),
    'run `npm run openapi` and commit the result',
  );
});

test('the operation table and the registered routes are the same set', () => {
  assert.deepEqual(Object.keys(operations).sort(), [...registeredRoutes()].sort());
});

test('every operation has a summary, and the CSV and idempotency key details stay documented', () => {
  for (const [route, op] of Object.entries(operations))
    assert.ok(op.summary, `${route} has a summary`);
  const paths = document.paths as Record<
    string,
    Record<
      string,
      {
        parameters?: { name: string; in: string; schema: { type?: string; pattern?: string } }[];
        responses: Record<string, { content?: Record<string, unknown> }>;
      }
    >
  >;
  const del = paths['/api/routines/{id}/rests/{date}']!.delete!;
  assert.deepEqual(
    del.parameters!.map((p) => p.name),
    ['id', 'date'],
  );
  assert.equal(del.parameters![1]!.schema.pattern, String.raw`^\d{4}-\d{2}-\d{2}$`);
  assert.ok(paths['/api/export/workouts.csv']!.get!.responses['200']!.content!['text/csv']);
  const post = paths['/api/workouts']!.post!;
  assert.ok(post.parameters!.some((p) => p.in === 'header' && p.name === 'Idempotency-Key'));
});

test('request schemas keep the server constraints for sets and goals', () => {
  const workout = schemaOf(workoutSchema) as {
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
  assert.equal((sets.items.properties.weight as { maximum: number }).maximum, 99999);
  assert.equal((sets.items.properties.reps as { type: string }).type, 'integer');
  const goal = schemaOf(goalSchema) as { required: string[] };
  assert.deepEqual(goal.required, [
    'exercise',
    'target_weight',
    'target_reps',
    'start_date',
    'deadline',
  ]);
});

test('a type JSON Schema cannot express fails instead of being skipped', () => {
  assert.throws(() => schemaOf(z.date()), /Date cannot be represented/);
});
