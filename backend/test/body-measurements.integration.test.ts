import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

type Row = {
  id: number;
  date: string;
  body_weight_kg: number | null;
  body_fat_percent: number | null;
  skeletal_muscle_kg: number | null;
};

// Test-owned dates far in the future; rows in this range are removed before and after.
const first = '2072-02-01';
const last = '2072-03-31';

test(
  'PostgreSQL body measurements: partial input, one record per date, edit/delete and inclusive ranges',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    let pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const cleanup = () =>
      pool.query('DELETE FROM body_measurements WHERE date BETWEEN $1 AND $2', [first, last]);
    await cleanup();
    let server = createApp(pool).listen(0, '127.0.0.1');
    const start = async () => {
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      return `http://127.0.0.1:${address.port}/api/body-measurements`;
    };
    const stop = () =>
      new Promise<void>((resolve, reject) =>
        server.listening ? server.close((error) => (error ? reject(error) : resolve())) : resolve(),
      );
    let base = await start();
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    try {
      // Partial input: only body weight. Missing metrics come back as null, not 0.
      const created = await call('', 'POST', { date: '2072-02-29', body_weight_kg: 72.35 });
      assert.equal(created.status, 201);
      const row = created.data as Row;
      assert.ok(Number.isInteger(row.id) && row.id > 0);
      assert.deepEqual(
        { ...row, id: 0 },
        {
          id: 0,
          date: '2072-02-29',
          body_weight_kg: 72.35,
          body_fat_percent: null,
          skeletal_muscle_kg: null,
        },
      );

      // A second record for the same date is a conflict; the original is unchanged.
      const duplicate = await call('', 'POST', { date: '2072-02-29', body_fat_percent: 18.5 });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.data.error, /이미.*기록/);
      let list = (await call(`?from=2072-02-29&to=2072-02-29`)).data as Row[];
      assert.equal(list.length, 1);
      assert.equal(list[0].body_fat_percent, null);
      assert.equal(list[0].body_weight_kg, 72.35);

      // Invalid values never reach a stored row.
      for (const body of [
        { date: '2072-03-02', body_weight_kg: 0 },
        { date: '2072-03-02', body_fat_percent: 100.5 },
        { date: '2072-03-02', skeletal_muscle_kg: -3 },
        { date: '2072-03-02', body_weight_kg: 70.123 },
        { date: '2072-03-02' },
      ])
        assert.equal((await call('', 'POST', body)).status, 400, JSON.stringify(body));
      assert.equal(((await call(`?from=2072-03-02&to=2072-03-02`)).data as Row[]).length, 0);

      // Edit replaces all three metrics: adding body fat and clearing weight keeps NULL.
      const edited = await call(`/${row.id}`, 'PUT', {
        date: '2072-02-29',
        body_weight_kg: null,
        body_fat_percent: 18.5,
        skeletal_muscle_kg: 33.05,
      });
      assert.equal(edited.status, 200);
      assert.deepEqual(edited.data, {
        id: row.id,
        date: '2072-02-29',
        body_weight_kg: null,
        body_fat_percent: 18.5,
        skeletal_muscle_kg: 33.05,
      });
      const emptied = await call(`/${row.id}`, 'PUT', {
        date: '2072-02-29',
        body_weight_kg: null,
        body_fat_percent: null,
        skeletal_muscle_kg: null,
      });
      assert.equal(emptied.status, 400, 'At least one metric is required on edit');

      // Boundary dates: rows just outside the range are excluded.
      const ids: Record<string, number> = { '2072-02-29': row.id };
      for (const [date, weight] of [
        ['2072-02-28', 71],
        ['2072-03-01', 70.5],
        ['2072-03-07', 70.25],
        ['2072-03-08', 70],
      ] as const) {
        const result = await call('', 'POST', { date, body_weight_kg: weight });
        assert.equal(result.status, 201, date);
        ids[date] = (result.data as Row).id;
      }
      list = (await call('?from=2072-02-29&to=2072-03-07')).data as Row[];
      assert.deepEqual(
        list.map((r) => r.date),
        ['2072-02-29', '2072-03-01', '2072-03-07'],
        'Inclusive range in ascending date order',
      );

      // Moving a record onto another record's date is a conflict and changes nothing.
      const moved = await call(`/${ids['2072-03-01']}`, 'PUT', {
        date: '2072-03-07',
        body_weight_kg: 69,
      });
      assert.equal(moved.status, 409);
      list = (await call('?from=2072-03-01&to=2072-03-07')).data as Row[];
      assert.deepEqual(
        list.map((r) => [r.date, r.body_weight_kg]),
        [
          ['2072-03-01', 70.5],
          ['2072-03-07', 70.25],
        ],
      );
      // Moving to a free date is allowed.
      const relocated = await call(`/${ids['2072-03-01']}`, 'PUT', {
        date: '2072-03-02',
        body_weight_kg: 70.5,
      });
      assert.equal(relocated.status, 200);
      assert.equal((relocated.data as Row).date, '2072-03-02');

      // Delete, then the record is gone and a second delete is 404.
      assert.equal((await call(`/${ids['2072-03-07']}`, 'DELETE')).status, 200);
      assert.equal((await call(`/${ids['2072-03-07']}`, 'DELETE')).status, 404);
      assert.equal(
        (await call(`/${ids['2072-03-07']}`, 'PUT', { date: '2072-03-07', body_weight_kg: 1 }))
          .status,
        404,
      );
      // After delete the date is free again.
      assert.equal(
        (await call('', 'POST', { date: '2072-03-07', body_fat_percent: 0 })).status,
        201,
      );

      // A fresh server and pool prove the stored precision and NULLs are durable.
      await stop();
      await pool.end();
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      server = createApp(pool).listen(0, '127.0.0.1');
      base = await start();
      list = (await call(`?from=${first}&to=${last}`)).data as Row[];
      assert.deepEqual(
        list.map((r) => [r.date, r.body_weight_kg, r.body_fat_percent, r.skeletal_muscle_kg]),
        [
          ['2072-02-28', 71, null, null],
          ['2072-02-29', null, 18.5, 33.05],
          ['2072-03-02', 70.5, null, null],
          ['2072-03-07', null, 0, null],
          ['2072-03-08', 70, null, null],
        ],
      );
      const stored = await pool.query(
        'SELECT count(*)::int AS n FROM body_measurements WHERE date BETWEEN $1 AND $2',
        [first, last],
      );
      assert.equal(stored.rows[0].n, 5, 'No estimated or duplicate rows were created');
    } finally {
      try {
        await stop();
      } finally {
        try {
          await cleanup();
        } finally {
          await pool.end();
        }
      }
    }
  },
);
