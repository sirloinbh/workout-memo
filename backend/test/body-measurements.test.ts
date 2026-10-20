import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { bodyMeasurementSchema } from '../src/domain.js';

type Query = { text: string; values?: unknown[] };
async function withServer(
  respond: (query: Query) => { rows: unknown[]; rowCount?: number } | Promise<never>,
  run: (
    call: (path: string, method?: string, body?: unknown) => Promise<Response>,
  ) => Promise<void>,
) {
  const queries: Query[] = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return respond({ text, values });
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run((path, method = 'GET', body) =>
      fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        // A string is sent verbatim so tests can submit JSON that JSON.stringify cannot produce.
        body:
          body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  return queries;
}

test('body measurement schema keeps partial input as NULL and never fills estimates', () => {
  assert.deepEqual(bodyMeasurementSchema.parse({ date: '2024-02-29', body_weight_kg: 72.35 }), {
    date: '2024-02-29',
    body_weight_kg: 72.35,
    body_fat_percent: null,
    skeletal_muscle_kg: null,
  });
  assert.deepEqual(
    bodyMeasurementSchema.parse({
      date: '2024-12-31',
      body_fat_percent: 0,
      skeletal_muscle_kg: null,
    }),
    { date: '2024-12-31', body_weight_kg: null, body_fat_percent: 0, skeletal_muscle_kg: null },
  );
  assert.equal(
    bodyMeasurementSchema.parse({ date: '2024-01-01', body_fat_percent: 100 }).body_fat_percent,
    100,
  );
  assert.equal(
    bodyMeasurementSchema.parse({ date: '2024-01-01', skeletal_muscle_kg: 999.99 })
      .skeletal_muscle_kg,
    999.99,
  );
});

const invalidBodies: [string, unknown][] = [
  ['no metric', { date: '2024-03-01' }],
  [
    'all metrics null',
    { date: '2024-03-01', body_weight_kg: null, body_fat_percent: null, skeletal_muscle_kg: null },
  ],
  ['zero weight', { date: '2024-03-01', body_weight_kg: 0 }],
  ['negative weight', { date: '2024-03-01', body_weight_kg: -70 }],
  ['zero muscle', { date: '2024-03-01', skeletal_muscle_kg: 0 }],
  ['negative muscle', { date: '2024-03-01', skeletal_muscle_kg: -1 }],
  ['body fat below 0', { date: '2024-03-01', body_fat_percent: -0.01 }],
  ['body fat above 100', { date: '2024-03-01', body_fat_percent: 100.01 }],
  ['weight above storage range', { date: '2024-03-01', body_weight_kg: 1000 }],
  ['three decimals', { date: '2024-03-01', body_weight_kg: 72.345 }],
  ['numeric string', { date: '2024-03-01', body_weight_kg: '72.5' }],
  ['boolean metric', { date: '2024-03-01', body_fat_percent: true }],
  ['impossible date', { date: '2023-02-29', body_weight_kg: 70 }],
  ['unpadded date', { date: '2024-3-01', body_weight_kg: 70 }],
  ['missing date', { body_weight_kg: 70 }],
];

test('body measurement API rejects invalid values with 400 before touching storage', async () => {
  const queries = await withServer(
    () => ({ rows: [] }),
    async (call) => {
      for (const [name, body] of invalidBodies) {
        for (const [path, method] of [
          ['/body-measurements', 'POST'],
          ['/body-measurements/1', 'PUT'],
        ]) {
          const response = await call(path, method, body);
          assert.equal(response.status, 400, `${method} ${name}`);
          assert.equal(typeof (await response.json()).error, 'string');
        }
      }
      // A JSON non-finite number cannot be sent, but an overflowing literal parses to Infinity.
      const overflow = await call(
        '/body-measurements',
        'POST',
        '{"date":"2024-03-01","body_weight_kg":1e400}',
      );
      assert.equal(overflow.status, 400);
      for (const query of [
        'from=2024-02-30&to=2024-03-01',
        'from=2024-02-29',
        'from=2025-01-05&to=2024-12-30',
      ]) {
        const response = await call(`/body-measurements?${query}`);
        assert.equal(response.status, 400, query);
      }
      for (const bad of ['0', '-1', 'abc'])
        for (const method of ['PUT', 'DELETE']) {
          const response = await call(
            `/body-measurements/${bad}`,
            method,
            method === 'PUT' ? { date: '2024-03-01', body_weight_kg: 70 } : undefined,
          );
          assert.equal(response.status, 400, `${method} id ${bad}`);
        }
    },
  );
  assert.equal(queries.length, 0);
});

test('body measurement API maps same-date conflicts to 409 and missing records to 404', async () => {
  await withServer(
    ({ text }) => {
      if (/^INSERT/.test(text)) return { rows: [], rowCount: 0 };
      if (/^UPDATE/.test(text))
        return Promise.reject(Object.assign(new Error('duplicate'), { code: '23505' }));
      return { rows: [], rowCount: 0 };
    },
    async (call) => {
      const created = await call('/body-measurements', 'POST', {
        date: '2024-03-01',
        body_weight_kg: 70,
      });
      assert.equal(created.status, 409);
      assert.match((await created.json()).error, /이미.*기록/);
      const moved = await call('/body-measurements/3', 'PUT', {
        date: '2024-03-01',
        body_weight_kg: 70,
      });
      assert.equal(moved.status, 409);
      assert.match((await moved.json()).error, /이미.*기록/);
      const removed = await call('/body-measurements/3', 'DELETE');
      assert.equal(removed.status, 404);
    },
  );
  await withServer(
    () => ({ rows: [], rowCount: 0 }),
    async (call) => {
      const updated = await call('/body-measurements/3', 'PUT', {
        date: '2024-03-01',
        body_fat_percent: 20,
      });
      assert.equal(updated.status, 404);
    },
  );
});

test('body measurement range query passes inclusive YYYY-MM-DD bounds to storage', async () => {
  const queries = await withServer(
    () => ({ rows: [] }),
    async (call) => {
      const response = await call('/body-measurements?from=2024-02-29&to=2024-02-29');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    },
  );
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, ['2024-02-29', '2024-02-29']);
  assert.match(queries[0].text, /BETWEEN \$1 AND \$2/);
});
