import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { createApp } from '../src/app.js';
import { routineSchedule, type RoutinePlan } from '../src/domain.js';
import { routineInput } from './routine-fixture.js';

// Far-future dates keep this routine the active one even while other test files
// insert routines into the same dedicated database.
const start = '2097-03-04';

test(
  'rest-day shift, same-day cancel, idempotency and reference records persist through the API',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const prefix = `Progress28-${randomUUID()}`;
    const routineIds: number[] = [];
    let today = '';
    let failCommit = false;
    // The wrapped pool lets one scenario fail the commit after the insert ran.
    const wrapped = {
      query: pool.query.bind(pool),
      connect: async () => {
        const client = await pool.connect();
        const query = client.query.bind(client) as PoolClient['query'];
        return Object.assign(client, {
          query: ((sql: unknown, ...rest: unknown[]) => {
            if (failCommit && sql === 'COMMIT') return Promise.reject(new Error('commit lost'));
            return (query as (...args: unknown[]) => unknown)(sql, ...rest);
          }) as PoolClient['query'],
        });
      },
    } as unknown as Pool;
    const server = createApp(wrapped, { today: () => today }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    const rests = async (id: number) =>
      (await pool.query('SELECT rest_date FROM routine_rests WHERE routine_id=$1', [id])).rows.map(
        (r: { rest_date: string }) => r.rest_date,
      );
    try {
      const input = routineInput(2);
      input.name = prefix;
      input.start_date = start;
      for (const split of input.splits)
        split.exercises.forEach((e, i) => (e.exercise = `${prefix}-운동${i}`));
      const older = await call('/routines', 'POST', { ...input, start_date: '2097-02-25' });
      assert.equal(older.status, 201);
      routineIds.push(older.data.id);
      const created = await call('/routines', 'POST', input);
      assert.equal(created.status, 201);
      const id = created.data.id as number;
      routineIds.push(id);
      const slots = routineSchedule(input as RoutinePlan).map((s) => s.date);
      today = slots[1];

      // An earlier actual record is offered only as a reference value.
      const record = await call('/workouts', 'POST', {
        date: slots[0],
        title: prefix,
        sets: [
          { exercise: `${prefix}-운동0`, weight: 95.5, reps: 8 },
          { exercise: `${prefix}-운동0`, weight: 97.5, reps: 7 },
          { exercise: `${prefix}-운동0`, weight: 120, reps: 5, completed: false },
        ],
      });
      assert.equal(record.status, 201);
      // #31: a newer journal holding only a planned (not completed) set is not the
      // previous record, and planned sets never appear as performance.
      const planned = await call('/workouts', 'POST', {
        date: slots[0],
        title: prefix,
        sets: [{ exercise: `${prefix}-운동0`, weight: 130, reps: 3, completed: false }],
      });
      assert.equal(planned.status, 201);
      const journal = async () =>
        (await pool.query('SELECT * FROM sets WHERE workout_id=$1 ORDER BY id', [record.data.id]))
          .rows;
      const journalBefore = await journal();

      await t.test('the latest started routine is active and shows planned values', async () => {
        const progress = await call('/routine-progress');
        assert.equal(progress.status, 200);
        assert.equal(progress.data.routine.id, id);
        const target = progress.data.today_plan.target;
        assert.equal(target.order, 2);
        assert.equal(target.split_name, '분할 2');
        assert.deepEqual(target.exercises[0], {
          exercise: `${prefix}-운동0`,
          sets: 3,
          weight: 102.75,
          reps: 10,
          base: { sets: 3, weight: 100.25, reps: 10 },
        });
        assert.deepEqual(progress.data.previous[`${prefix}-운동0`.toLowerCase()], {
          date: slots[0],
          sets: [
            { weight: 95.5, reps: 8 },
            { weight: 97.5, reps: 7 },
          ],
        });
        assert.equal(progress.data.rest_preview.excluded[0].order, 36);
        assert.equal(
          (await pool.query('SELECT id FROM workouts WHERE title=$1', [prefix])).rowCount,
          2,
          'loading targets never creates a journal',
        );
      });

      await t.test('rest on a routine that is not in progress is refused', async () => {
        const refused = await call(`/routines/${older.data.id}/rests`, 'POST', { date: today });
        assert.equal(refused.status, 409);
        assert.deepEqual(await rests(older.data.id), []);
      });

      await t.test('a commit failure leaves no rest behind', async () => {
        failCommit = true;
        try {
          const failed = await call(`/routines/${id}/rests`, 'POST', { date: today });
          assert.equal(failed.status, 500);
        } finally {
          failCommit = false;
        }
        assert.deepEqual(await rests(id), []);
      });

      let preview: { moves: { order: number; to: string | null }[]; excluded: { order: number }[] };
      await t.test('concurrent duplicate requests apply the rest exactly once', async () => {
        preview = (await call('/routine-progress')).data.rest_preview;
        const results = await Promise.all([
          call(`/routines/${id}/rests`, 'POST', { date: today }),
          call(`/routines/${id}/rests`, 'POST', { date: today }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
        assert.deepEqual(await rests(id), [today]);
        const progress = (await call('/routine-progress')).data;
        assert.equal(progress.rested_today, true);
        for (const move of preview.moves) {
          const landed = progress.days.find(
            (d: { target: { order: number } | null }) => d.target?.order === move.order,
          );
          assert.equal(landed?.date ?? null, move.to, 'applied schedule equals the preview');
        }
        assert.deepEqual(
          progress.excluded.map((x: { order: number }) => x.order),
          preview.excluded.map((x) => x.order),
        );
        assert.equal(progress.end_date, '2097-05-26', 'the 12-week end date is fixed');
        assert.deepEqual(await journal(), journalBefore, 'saved sets are never modified');
      });

      await t.test('cancel works only on the same day and restores the schedule', async () => {
        today = slots[2];
        const late = await call(`/routines/${id}/rests/${slots[1]}`, 'DELETE');
        assert.equal(late.status, 409);
        assert.deepEqual(await rests(id), [slots[1]]);
        today = slots[1];
        const cancelled = await call(`/routines/${id}/rests/${slots[1]}`, 'DELETE');
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.data.applied, true);
        assert.deepEqual(await rests(id), []);
        assert.equal(cancelled.data.excluded.length, 0);
        assert.equal(cancelled.data.today_plan.target.order, 2);
        const again = await call(`/routines/${id}/rests/${slots[1]}`, 'DELETE');
        assert.equal(again.status, 200);
        assert.equal(again.data.applied, false, 'a repeated cancel is a no-op');
      });

      await t.test('rests on different days accumulate', async () => {
        for (const day of [slots[1], slots[2]]) {
          today = day;
          assert.equal((await call(`/routines/${id}/rests`, 'POST', { date: day })).status, 201);
        }
        const progress = (await call('/routine-progress')).data;
        assert.deepEqual(
          progress.excluded.map((x: { order: number }) => x.order),
          [35, 36],
        );
        assert.deepEqual(await journal(), journalBefore);
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        await pool.query('DELETE FROM workouts WHERE title=$1', [prefix]);
        for (const id of routineIds) await pool.query('DELETE FROM routines WHERE id=$1', [id]);
      } finally {
        await pool.end();
      }
    }
  },
);
