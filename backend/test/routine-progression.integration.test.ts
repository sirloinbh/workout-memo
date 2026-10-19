import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { routineSchedule, type RoutinePlan } from '../src/domain.js';
import { autoRoutineInput } from './routine-fixture.js';

// Adaptive auto targets read the real saved journal sets. Far-future dates keep
// this routine active while other files share the dedicated test database.
test(
  'auto routine targets advance on met records, hold on missed ones and never modify journals',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const prefix = `Progression28-${randomUUID()}`;
    let routineId: number | undefined;
    const input = autoRoutineInput();
    input.name = prefix;
    input.start_date = '2096-03-05';
    const [bench, pullUp, curl] = input.splits[0].exercises.map((e) => {
      e.exercise = `${prefix}-${e.exercise}`;
      return e.exercise;
    });
    const slots = routineSchedule(input as unknown as RoutinePlan);
    const week2 = slots.find((s) => s.week === 2)!.date;
    let today = slots[0].date;
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
    type Ex = {
      exercise: string;
      weight: number;
      reps: number;
      projected: boolean;
      result?: string | null;
    };
    const targetOf = (data: { today_plan: { target: { exercises: Ex[] } } }, name: string) =>
      data.today_plan.target.exercises.find((e) => e.exercise === name)!;
    try {
      const created = await call('/routines', 'POST', input);
      assert.equal(created.status, 201);
      routineId = created.data.id;
      const saved = await call(`/routines/${routineId}`);
      assert.equal(saved.data.progression, 'auto');
      assert.equal(saved.data.weeks, undefined, 'auto plans store no manual weeks');

      const first = await call('/routine-progress');
      assert.equal(first.data.routine.id, routineId);
      assert.deepEqual(
        [targetOf(first.data, bench).weight, targetOf(first.data, bench).reps],
        [100, 10],
      );
      assert.equal(targetOf(first.data, bench).projected, false);

      const set = (exercise: string, weight: number, reps: number) => ({ exercise, weight, reps });
      const workout = await call('/workouts', 'POST', {
        date: slots[1].date,
        title: prefix,
        sets: [
          set(bench, 100, 10),
          set(bench, 100, 10),
          set(bench, 102.5, 11),
          set(curl, 40, 12),
          set(curl, 40, 12),
          set(curl, 40, 11),
        ],
      });
      assert.equal(workout.status, 201);
      const before = (
        await pool.query('SELECT * FROM sets WHERE workout_id=$1 ORDER BY id', [workout.data.id])
      ).rows;

      today = week2;
      const next = await call('/routine-progress');
      assert.equal(next.status, 200);
      const benchTarget = targetOf(next.data, bench);
      assert.deepEqual([benchTarget.weight, benchTarget.reps], [100, 11], 'met target advances');
      assert.equal(benchTarget.projected, false);
      const curlTarget = targetOf(next.data, curl);
      assert.deepEqual([curlTarget.weight, curlTarget.reps], [40, 12], 'one short set holds');
      const pullTarget = targetOf(next.data, pullUp);
      assert.deepEqual([pullTarget.weight, pullTarget.reps], [0, 10], 'no record holds');
      const week1 = next.data.weeks[0].entries[0].target.exercises as Ex[];
      assert.equal(week1.find((e) => e.exercise === bench)!.result, 'achieved');
      assert.equal(week1.find((e) => e.exercise === curl)!.result, 'missed');
      const later = next.data.this_week.find((d: { date: string }) => d.date > week2);
      assert.equal(
        later.target.exercises.find((e: Ex) => e.exercise === bench).projected,
        true,
        'future sessions are labelled as projected',
      );
      const week5 = next.data.weeks[4].entries[0].target.exercises as Ex[];
      assert.deepEqual(
        [
          week5.find((e) => e.exercise === curl)!.weight,
          week5.find((e) => e.exercise === curl)!.reps,
        ],
        [42.5, 9],
        'held curl shifts later weeks: 40x12 → 42.5x8 → deload → 42.5x9',
      );

      // Rest today still shifts plan order with adaptive values in place.
      const rest = await call(`/routines/${routineId}/rests`, 'POST', { date: today });
      assert.equal(rest.status, 201);
      const shifted = rest.data.days.find(
        (d: { date: string; rest: boolean }) => d.date > week2 && !d.rest,
      );
      assert.equal(shifted.target.week, 2);
      assert.deepEqual(
        [
          shifted.target.exercises.find((e: Ex) => e.exercise === bench).weight,
          shifted.target.exercises.find((e: Ex) => e.exercise === bench).reps,
        ],
        [100, 11],
      );
      assert.deepEqual(
        (await pool.query('SELECT * FROM sets WHERE workout_id=$1 ORDER BY id', [workout.data.id]))
          .rows,
        before,
        'reading progress never modifies saved sets',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        await pool.query('DELETE FROM workouts WHERE title=$1', [prefix]);
        if (routineId) await pool.query('DELETE FROM routines WHERE id=$1', [routineId]);
      } finally {
        await pool.end();
      }
    }
  },
);
