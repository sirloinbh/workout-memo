import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

const goal = {
  exercise: 'Squat',
  target_weight: 100,
  target_reps: 10,
  start_date: '2000-01-10',
  deadline: '2000-01-20',
};
const invalidGoals = [
  { exercise: '   ' },
  { exercise: 'x'.repeat(121) },
  { exercise: null },
  { target_weight: -1 },
  { target_weight: 100000 },
  { target_weight: '100' },
  { target_reps: 0 },
  { target_reps: 1.5 },
  { target_reps: 1001 },
  { target_reps: '10' },
  { start_date: '2000-02-30' },
  { start_date: null },
  { deadline: '2000-01-09' },
  { deadline: '2000-02-30' },
  { deadline: '01/20/2000' },
];

async function withApi(pool: Pool, run: (call: ApiCall) => Promise<void>) {
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing HTTP address');
    const base = `http://127.0.0.1:${address.port}/api`;
    await run(async (path, method = 'GET', body) => {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
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
type SavedGoal = typeof goal & { id: number; achieved: boolean };

test('goal API rejects invalid names, periods and numeric targets before persistence', async (t) => {
  let writes = 0;
  const pool = {
    query: async () => {
      writes++;
      throw Error('Invalid goal must not reach persistence');
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const invalid of invalidGoals) {
      await t.test(JSON.stringify(invalid), async () => {
        const response = await call('/goals', 'POST', { ...goal, ...invalid });
        assert.equal(response.status, 400);
        assert.equal(typeof (response.data as { error: unknown }).error, 'string');
      });
    }
  });
  assert.equal(writes, 0);
});

test(
  'goal API persists targets and re-evaluates achievement across boundaries and workout edits',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const workoutIds: number[] = [];
    let goalId: number | undefined;
    try {
      await withApi(pool, async (call) => {
        const exercise = 'Goal-' + randomUUID();
        const input = { ...goal, exercise };
        const created = await call('/goals', 'POST', input);
        assert.equal(created.status, 201);
        goalId = (created.data as SavedGoal).id;
        const readGoal = async () => {
          const response = await call('/goals');
          assert.equal(response.status, 200);
          const saved = (response.data as SavedGoal[]).find((item) => item.id === goalId);
          assert.ok(saved, 'Created goal is listed');
          return saved;
        };
        const saved = await readGoal();
        assert.equal(saved.exercise, exercise);
        assert.equal(Number(saved.target_weight), input.target_weight);
        assert.equal(saved.target_reps, input.target_reps);
        assert.equal(saved.start_date, input.start_date);
        assert.equal(saved.deadline, input.deadline);
        assert.equal(saved.achieved, false);

        const set = { exercise, weight: 100, reps: 10 };
        const createdWorkout = await call('/workouts', 'POST', {
          date: '2000-01-15',
          title: exercise,
          sets: [set],
        });
        assert.equal(createdWorkout.status, 201);
        const workoutId = (createdWorkout.data as { id: number }).id;
        workoutIds.push(workoutId);
        const cases = [
          { name: 'equal targets on start date', date: '2000-01-10', sets: [set], achieved: true },
          { name: 'equal targets on end date', date: '2000-01-20', sets: [set], achieved: true },
          { name: 'before start', date: '2000-01-09', sets: [set], achieved: false },
          { name: 'after end', date: '2000-01-21', sets: [set], achieved: false },
          { name: 'weight below target', sets: [{ ...set, weight: 99.99 }], achieved: false },
          { name: 'reps below target', sets: [{ ...set, reps: 9 }], achieved: false },
          {
            name: 'targets split across sets do not combine',
            sets: [
              { ...set, reps: 9 },
              { ...set, weight: 99 },
            ],
            achieved: false,
          },
          {
            name: 'different exercise',
            sets: [{ ...set, exercise: exercise + '-other' }],
            achieved: false,
          },
          {
            name: 'trimmed case-insensitive exercise',
            sets: [{ ...set, exercise: `  ${exercise.toUpperCase()}  ` }],
            achieved: true,
          },
          {
            name: 'both targets exceeded in one set',
            sets: [{ ...set, weight: 101, reps: 11 }],
            achieved: true,
          },
          {
            name: 'removing the qualifying set clears achievement',
            sets: [{ ...set, weight: 50 }],
            achieved: false,
          },
          {
            name: 'adding a qualifying set restores achievement',
            sets: [{ ...set, weight: 50 }, set],
            achieved: true,
          },
        ];
        for (const scenario of cases) {
          await t.test(scenario.name, async () => {
            const revision = await pool.query('SELECT version FROM workouts WHERE id=$1', [
              workoutId,
            ]);
            const response = await call(`/workouts/${workoutId}`, 'PUT', {
              version: revision.rows[0].version,
              date: scenario.date ?? '2000-01-15',
              title: exercise,
              sets: scenario.sets,
            });
            assert.equal(response.status, 200);
            assert.equal((await readGoal()).achieved, scenario.achieved);
          });
        }
        assert.equal((await call(`/workouts/${workoutId}`, 'DELETE')).status, 200);
        assert.equal((await readGoal()).achieved, false);

        const sameDay = await call('/goals', 'POST', { ...input, start_date: input.deadline });
        assert.equal(sameDay.status, 201, 'A goal may start and end on the same day');
        const sameDayId = (sameDay.data as SavedGoal).id;
        await pool.query('DELETE FROM goals WHERE id=$1', [sameDayId]);
      });
    } finally {
      for (const workoutId of workoutIds)
        await pool.query('DELETE FROM workouts WHERE id=$1', [workoutId]);
      if (goalId !== undefined) await pool.query('DELETE FROM goals WHERE id=$1', [goalId]);
      await pool.end();
    }
  },
);

test(
  'achievement uses today in Asia/Seoul independently of the PostgreSQL session timezone',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    // These sessions straddle Seoul's date at every hour of the day. CURRENT_DATE
    // therefore gives the wrong cutoff in at least one session, regardless of CI time.
    for (const timezone of ['Etc/GMT+12', 'Etc/GMT-14']) {
      await t.test(timezone, async (t) => {
        const pool = new Pool({
          connectionString: process.env.TEST_DATABASE_URL,
          options: `-c timezone=${timezone}`,
          max: 1,
        });
        const goalIds: number[] = [];
        const workoutIds: number[] = [];
        try {
          await withApi(pool, async (call) => {
            const dates = (
              await pool.query<{ today: string; tomorrow: string }>(
                `SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date::text today,
                 ((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date + 1)::text tomorrow`,
              )
            ).rows[0];
            for (const [name, date, achieved] of [
              ['today is included', dates.today, true],
              ['tomorrow is excluded', dates.tomorrow, false],
            ] as const) {
              await t.test(name, async () => {
                const exercise = 'Seoul-' + randomUUID();
                const created = await call('/goals', 'POST', {
                  ...goal,
                  exercise,
                  start_date: dates.today,
                  deadline: dates.tomorrow,
                });
                assert.equal(created.status, 201);
                const goalId = (created.data as SavedGoal).id;
                goalIds.push(goalId);
                const workout = await call('/workouts', 'POST', {
                  date,
                  title: exercise,
                  sets: [{ exercise, weight: 100, reps: 10 }],
                });
                assert.equal(workout.status, 201);
                workoutIds.push((workout.data as { id: number }).id);
                const response = await call('/goals');
                assert.equal(response.status, 200);
                assert.equal(
                  (response.data as SavedGoal[]).find((item) => item.id === goalId)?.achieved,
                  achieved,
                );
              });
            }
          });
        } finally {
          for (const workoutId of workoutIds)
            await pool.query('DELETE FROM workouts WHERE id=$1', [workoutId]);
          for (const goalId of goalIds) await pool.query('DELETE FROM goals WHERE id=$1', [goalId]);
          await pool.end();
        }
      });
    }
  },
);
