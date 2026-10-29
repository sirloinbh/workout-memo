import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { weightStepSchema } from '../src/domain.js';
import { autoRoutineInput } from './routine-fixture.js';

// #86: per-exercise progressive overload increment (default 5 kg) and goal suggestions.
test('increments are positive, at most 100 kg and two decimals; null resets', () => {
  for (const weight_step of [5, 2.5, 1.25, 0.01, 100, null])
    assert.equal(weightStepSchema.safeParse({ exercise: '벤치', weight_step }).success, true);
  for (const weight_step of [0, -2.5, 100.01, 1.255, '5', Number.NaN])
    assert.equal(
      weightStepSchema.safeParse({ exercise: '벤치', weight_step }).success,
      false,
      `weight_step ${String(weight_step)}`,
    );
});

test(
  'increments drive goal suggestions and auto routine targets, including saved routines',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const prefix = `Step86-${randomUUID()}`;
    const bench = `${prefix}-벤치`;
    const today = '2097-03-04';
    const server = createApp(pool, { today: () => today }).listen(0, '127.0.0.1');
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
    const suggest = async () =>
      (await call(`/goal-suggestion?exercise=${encodeURIComponent(' ' + bench + ' ')}`)).data;
    let routineId: number | undefined;
    try {
      // Nothing recorded: no suggestion, default increment.
      assert.deepEqual(await suggest(), {
        exercise: bench.toLowerCase(),
        weight_step: 5,
        custom: false,
        base: null,
        target_weight: null,
      });
      // The heaviest completed set of the latest workout is the base.
      const set = (weight: number, reps: number, completed = true) => ({
        exercise: bench,
        weight,
        reps,
        completed,
      });
      for (const [date, sets] of [
        ['2097-03-01', [set(120, 5)]],
        ['2097-03-02', [set(100, 8), set(102.5, 6), set(150, 1, false)]],
      ] as const)
        assert.equal((await call('/workouts', 'POST', { date, title: prefix, sets })).status, 201);
      let s = await suggest();
      assert.deepEqual(s.base, { source: 'record', weight: 102.5, reps: 6, date: '2097-03-02' });
      assert.equal(s.target_weight, 107.5);

      const saved = await call('/exercise-weight-steps', 'PUT', {
        exercise: bench,
        weight_step: 2.5,
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.data, {
        exercise: bench.toLowerCase(),
        weight_step: 2.5,
        custom: true,
      });
      s = await suggest();
      assert.equal(s.target_weight, 105);
      assert.equal(s.custom, true);
      const listed = (await call('/exercise-weight-steps')).data as { exercise: string }[];
      assert.ok(listed.some((r) => r.exercise === bench.toLowerCase()));

      // A goal of the exercise takes precedence over records.
      const goal = await call('/goals', 'POST', {
        exercise: bench,
        target_weight: 110,
        target_reps: 5,
        start_date: '2097-03-01',
        deadline: '2097-06-30',
      });
      assert.equal(goal.status, 201);
      s = await suggest();
      assert.deepEqual(s.base, { source: 'goal', weight: 110, reps: 5 });
      assert.equal(s.target_weight, 112.5);

      // Auto routine (already saved) uses the current increment of the exercise.
      const input = autoRoutineInput();
      input.name = prefix;
      input.start_date = '2097-03-04';
      input.splits[0].exercises = [
        { exercise: bench, sets: 3, weight: 100, reps: 12, rep_min: 8, rep_max: 12 },
      ];
      const created = await call('/routines', 'POST', input);
      assert.equal(created.status, 201);
      routineId = created.data.id;
      const second = async () => {
        const days = (await call('/routine-progress')).data.days as {
          target: { exercises: { weight: number; reps: number }[] } | null;
        }[];
        const e = days.filter((d) => d.target)[1].target!.exercises[0];
        return [e.weight, e.reps];
      };
      assert.deepEqual(await second(), [102.5, 8], 'session 2 adds the 2.5 kg increment');
      await call('/exercise-weight-steps', 'PUT', { exercise: bench, weight_step: null });
      assert.deepEqual(await second(), [105, 8], 'reset goes back to the 5 kg default');
      assert.equal((await suggest()).custom, false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        await pool.query('DELETE FROM workouts WHERE title=$1', [prefix]);
        await pool.query('DELETE FROM goals WHERE exercise=$1', [bench]);
        await pool.query('DELETE FROM exercise_weight_steps WHERE exercise=$1', [
          bench.toLowerCase(),
        ]);
        if (routineId) await pool.query('DELETE FROM routines WHERE id=$1', [routineId]);
      } finally {
        await pool.end();
      }
    }
  },
);
