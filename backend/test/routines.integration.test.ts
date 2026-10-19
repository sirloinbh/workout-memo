import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { routineInput, type SavedRoutine, type RoutineInput } from './routine-fixture.js';

async function withApi(pool: Pool, run: (call: ApiCall) => Promise<void>) {
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(async (path, method = 'GET', body) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : { error: 'Expected JSON API response' };
      return { status: response.status, data };
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
type ApiCall = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<{ status: number; data: unknown }>;

function assertPlan(saved: SavedRoutine, expected: RoutineInput) {
  assert.equal(saved.name, expected.name);
  assert.equal(saved.start_date, expected.start_date);
  assert.equal(saved.split_count, expected.split_count);
  assert.equal(saved.weekly_workouts, expected.weekly_workouts);
  assert.deepEqual(saved.rest_days, expected.rest_days);
  assert.deepEqual(saved.splits, expected.splits, 'Keep repeats, order, sets and total kg');
  assert.deepEqual(saved.weeks, expected.weeks, 'Keep every manual amount including week 5');
  assert.equal(saved.weeks[0].week, 1);
  assert.equal(saved.weeks.at(-1)?.week, 12);
  assert.deepEqual(
    saved.weeks.filter((week) => week.kind === 'deload').map((week) => week.week),
    [4, 8, 12],
  );

  // A leap-day start falls on a rest day. The cycle advances only on training
  // days and continues across Monday and deload boundaries without resetting.
  const expectedDates: { date: string; week: number; split_index: number; is_deload: boolean }[] =
    [];
  for (let offset = 0; offset < 84; offset++) {
    const date = new Date('2024-02-29T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    if (expected.rest_days.includes(date.getUTCDay())) continue;
    const week = Math.floor(offset / 7) + 1;
    expectedDates.push({
      date: date.toISOString().slice(0, 10),
      week,
      split_index: expectedDates.length % expected.split_count,
      is_deload: week % 4 === 0,
    });
  }
  assert.equal(expectedDates.length, 36);
  assert.deepEqual(
    saved.schedule,
    expectedDates,
    '12 weeks must honor rest days and rotating splits',
  );
}

test(
  'routine API durably round trips all splits, duplicates, manual goals and the 12-week schedule without creating journals or goals',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    let pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const ids: number[] = [];
    const inputs: RoutineInput[] = [];
    const prefix = `Routine27-${randomUUID()}`;
    try {
      await withApi(pool, async (call) => {
        for (const count of [1, 2, 3, 4, 5]) {
          await t.test(`save and read ${count}-way split`, async () => {
            const input = routineInput(count);
            input.name = `${prefix}-${count}`;
            for (const split of input.splits)
              split.exercises.forEach((exercise, index) => {
                exercise.exercise = `${prefix}-${index}`;
              });
            input.weeks[7].deload_metric = 'sets';
            input.weeks[7].amount = 1;
            input.weeks[11].deload_metric = 'reps';
            input.weeks[11].amount = 3;
            const created = await call('/routines', 'POST', input);
            assert.equal(created.status, 201);
            const id = (created.data as { id: number }).id;
            assert.ok(Number.isInteger(id) && id > 0);
            ids.push(id);
            inputs.push(input);
            const detail = await call(`/routines/${id}`);
            assert.equal(detail.status, 200);
            assertPlan(detail.data as SavedRoutine, input);
            const list = await call('/routines');
            assert.equal(list.status, 200);
            assert.ok((list.data as { id: number }[]).some((row) => row.id === id));
          });
        }
      });
      // A fresh server and pool distinguish durable persistence from process memory.
      await pool.end();
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      await withApi(pool, async (call) => {
        for (const [index, id] of ids.entries()) {
          const result = await call(`/routines/${id}`);
          assert.equal(result.status, 200);
          assertPlan(result.data as SavedRoutine, inputs[index]);
        }
      });
      assert.equal(
        (await pool.query('SELECT id FROM sets WHERE exercise LIKE $1', [prefix + '%'])).rowCount,
        0,
        'Saving a plan must not create actual journal sets',
      );
      assert.equal(
        (await pool.query('SELECT id FROM goals WHERE exercise LIKE $1', [prefix + '%'])).rowCount,
        0,
        'Saving a plan must not create #18 achievement goals',
      );
    } finally {
      try {
        // Test-owned rows only. Routine storage is the proposed #27 contract.
        for (const id of ids) await pool.query('DELETE FROM routines WHERE id=$1', [id]);
      } finally {
        await pool.end();
      }
    }
  },
);
