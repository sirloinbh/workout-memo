import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { volume, workoutSchema } from '../src/domain.js';

const workout = {
  date: '2026-10-15',
  title: '하체',
  sets: [{ exercise: '스쿼트', weight: 100, reps: 10 }],
};
const invalidRpe = [0, 0.5, 10.5, 11, -1, 7.25, 8.1, '8', true, Number.NaN];

test('older clients save completed sets and a missing RPE stays empty instead of 0', () => {
  const parsed = workoutSchema.parse(workout).sets[0];
  assert.equal(parsed.completed, true);
  assert.equal(parsed.rpe, null);
  for (const rpe of [null, 1, 1.5, 6.5, 9.5, 10]) {
    assert.equal(
      workoutSchema.parse({ ...workout, sets: [{ ...workout.sets[0], rpe }] }).sets[0].rpe,
      rpe,
    );
  }
  const planned = workoutSchema.parse({
    ...workout,
    sets: [{ ...workout.sets[0], completed: false }],
  });
  assert.equal(planned.sets[0].completed, false);
});

test('RPE outside 1-10 or off the 0.5 step and non-boolean completion are rejected', () => {
  for (const rpe of invalidRpe)
    assert.equal(
      workoutSchema.safeParse({ ...workout, sets: [{ ...workout.sets[0], rpe }] }).success,
      false,
      `rpe ${String(rpe)}`,
    );
  for (const completed of ['true', 1, null])
    assert.equal(
      workoutSchema.safeParse({ ...workout, sets: [{ ...workout.sets[0], completed }] }).success,
      false,
      `completed ${String(completed)}`,
    );
});

test('volume counts only completed sets', () => {
  assert.equal(
    volume([
      { weight: 100, reps: 10 },
      { weight: 50, reps: 10, completed: true },
      { weight: 200, reps: 10, completed: false },
    ]),
    1500,
  );
});

test('invalid RPE is rejected by the API before any write', async () => {
  let writes = 0;
  const pool = {
    query: async () => {
      writes++;
      throw Error('Invalid RPE must not reach persistence');
    },
    connect: async () => {
      writes++;
      throw Error('Invalid RPE must not reach persistence');
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const rpe of [...invalidRpe.filter((v) => !Number.isNaN(v)), 'ten']) {
      for (const [method, path] of [
        ['POST', '/workouts'],
        ['PUT', '/workouts/1'],
      ]) {
        const response: Response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...workout, version: 1, sets: [{ ...workout.sets[0], rpe }] }),
        });
        assert.equal(response.status, 400, `${method} rpe ${String(rpe)}`);
        assert.equal(typeof (await response.json()).error, 'string');
      }
    }
    assert.equal(writes, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test(
  'set completion migration keeps existing sets completed and can be reapplied',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // A session-local table shadows public.sets; no existing test rows are altered.
      await client.query(
        'CREATE TEMP TABLE sets (id integer PRIMARY KEY, exercise text) ON COMMIT DROP',
      );
      await client.query("INSERT INTO sets VALUES (1, '스쿼트')");
      const migration = readFileSync(
        new URL('../../database/migrations/006_set_completion_rpe.sql', import.meta.url),
        'utf8',
      );
      await client.query(migration);
      const rows = async () =>
        (await client.query('SELECT id, completed, rpe::float8 rpe FROM sets ORDER BY id')).rows;
      assert.deepEqual(await rows(), [{ id: 1, completed: true, rpe: null }]);
      await client.query('UPDATE sets SET completed=false, rpe=8.5 WHERE id=1');
      await client.query(migration);
      assert.deepEqual(await rows(), [{ id: 1, completed: false, rpe: 8.5 }]);
      for (const rpe of [0, 0.5, 10.5, 7.25]) {
        await client.query('SAVEPOINT bad_rpe');
        await assert.rejects(
          client.query("INSERT INTO sets(id, exercise, rpe) VALUES (2, 'x', $1)", [rpe]),
          { code: '23514' },
          `database rejects rpe ${rpe}`,
        );
        await client.query('ROLLBACK TO SAVEPOINT bad_rpe');
      }
      await client.query("INSERT INTO sets(id, exercise) VALUES (3, '런지')");
      assert.deepEqual((await rows()).at(-1), { id: 3, completed: true, rpe: null });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);

test(
  'completion and RPE persist, and only completed sets achieve goals',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const call = async (path: string, method = 'GET', body?: unknown, key?: string) => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const exercise = 'Completion-' + randomUUID();
    const workoutIds: number[] = [];
    let goalId: number | undefined;
    try {
      const goal = await call('/goals', 'POST', {
        exercise,
        target_weight: 150,
        target_reps: 10,
        start_date: '2001-03-10',
        deadline: '2001-03-20',
      });
      assert.equal(goal.status, 201);
      goalId = goal.data.id;
      const achieved = async () =>
        (await call('/goals')).data.find((g: { id: number }) => g.id === goalId).achieved;
      const read = async (date: string, id: number) =>
        (await call(`/workouts?from=${date}&to=${date}`)).data.find(
          (w: { id: number }) => w.id === id,
        );
      const body = {
        date: '2001-03-20',
        title: exercise,
        notes: '',
        sets: [
          { exercise, weight: 100, reps: 10, completed: true, rpe: 8.5 },
          { exercise, weight: 200, reps: 10, completed: false },
          { exercise, weight: 60, reps: 12 },
        ],
      };
      const key = randomUUID();
      const created = await call('/workouts', 'POST', body, key);
      assert.equal(created.status, 201);
      workoutIds.push(created.data.id);
      const id = created.data.id;

      await t.test('state and RPE are restored on a fresh read; empty RPE is not 0', async () => {
        const saved = await read(body.date, id);
        assert.deepEqual(
          saved.sets.map((s: { completed: boolean; rpe: number | null }) => ({
            completed: s.completed,
            rpe: s.rpe === null ? null : Number(s.rpe),
          })),
          [
            { completed: true, rpe: 8.5 },
            { completed: false, rpe: null },
            { completed: true, rpe: null },
          ],
        );
      });

      await t.test('a duplicate submission with the same key creates one record', async () => {
        const again = await call('/workouts', 'POST', body, key);
        assert.equal(again.data.id, id);
        const all = (await call(`/workouts?from=${body.date}&to=${body.date}`)).data.filter(
          (w: { title: string }) => w.title === exercise,
        );
        assert.equal(all.length, 1);
      });

      await t.test('a not-completed set on the deadline does not achieve the goal', async () => {
        assert.equal(await achieved(), false);
      });

      let version = created.data.version;
      const edit = async (completed: boolean) => {
        const response = await call(`/workouts/${id}`, 'PUT', {
          ...body,
          version,
          sets: [body.sets[0], { ...body.sets[1], completed, rpe: 9 }, body.sets[2]],
        });
        assert.equal(response.status, 200);
        version = response.data.version;
      };
      await t.test('marking the set completed achieves the goal on the boundary date', async () => {
        await edit(true);
        assert.equal(await achieved(), true);
        assert.equal((await read(body.date, id)).sets[1].completed, true);
      });
      await t.test('undoing completion removes the achievement again', async () => {
        await edit(false);
        assert.equal(await achieved(), false);
        const saved = await read(body.date, id);
        assert.equal(saved.sets[1].completed, false);
        assert.equal(Number(saved.sets[1].rpe), 9);
      });
      await t.test('an invalid RPE leaves the saved record untouched', async () => {
        const before = await read(body.date, id);
        const response = await call(`/workouts/${id}`, 'PUT', {
          ...body,
          version,
          sets: [{ ...body.sets[0], rpe: 10.5 }],
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await read(body.date, id), before);
      });
      await t.test('a completed set after the deadline does not achieve the goal', async () => {
        const late = await call('/workouts', 'POST', {
          ...body,
          date: '2001-03-21',
          sets: [{ ...body.sets[1], completed: true }],
        });
        assert.equal(late.status, 201);
        workoutIds.push(late.data.id);
        assert.equal(await achieved(), false);
      });
    } finally {
      try {
        for (const workoutId of workoutIds)
          await pool.query('DELETE FROM workouts WHERE id=$1', [workoutId]);
        if (goalId) await pool.query('DELETE FROM goals WHERE id=$1', [goalId]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await pool.end();
      }
    }
  },
);
