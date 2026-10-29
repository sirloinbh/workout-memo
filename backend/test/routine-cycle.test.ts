import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { Pool } from 'pg';
import ts from 'typescript';

import { createApp } from '../src/app.js';
import { type RoutinePlan, routineSchedule, routineSchema } from '../src/domain.js';
import { arrangeTargets, routineProgress } from '../src/progress.js';
import { autoRoutineInput, routineInput } from './routine-fixture.js';

// #88: "N training days + M rest days" cycles counted from the start date. Saved weekday
// routines (no schedule_mode) keep their behaviour.
const cycles: [number, number, number][] = [
  // [split count, training days, rest days] from the issue table
  [1, 2, 1],
  [2, 2, 1],
  [3, 3, 1],
  [4, 4, 1],
  [5, 5, 2],
];
function cyclePlan(splits: number, train: number, rest: number) {
  const base = routineInput(splits);
  return routineSchema.parse({
    ...base,
    schedule_mode: 'cycle',
    cycle: { train_days: train, rest_days: rest },
    rest_days: [],
    weekly_workouts: Math.min(7, train),
  }) as RoutinePlan;
}

test('each split default follows its cycle for all 84 days', () => {
  for (const [splits, train, rest] of cycles) {
    const plan = cyclePlan(splits, train, rest);
    const schedule = routineSchedule(plan);
    const expected: string[] = [];
    for (let offset = 0; offset < 84; offset++)
      if (offset % (train + rest) < train) {
        const d = new Date(plan.start_date + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + offset);
        expected.push(d.toISOString().slice(0, 10));
      }
    assert.deepEqual(
      schedule.map((s) => s.date),
      expected,
      `${splits}분할 ${train}+${rest}`,
    );
    schedule.forEach((s, i) => {
      assert.equal(s.split_index, i % splits, 'splits rotate over training days');
      assert.equal(s.is_deload, s.week % 4 === 0);
    });
  }
});

test('the schema keeps cycle and weekday fields apart; saved weekday plans are unchanged', () => {
  const weekday = routineInput(2);
  const parsed = routineSchema.parse(weekday);
  assert.equal(parsed.schedule_mode, undefined);
  assert.ok(
    routineSchedule(parsed).every(
      (s) => !weekday.rest_days.includes(new Date(s.date + 'T00:00:00Z').getUTCDay()),
    ),
  );
  const bad = (value: object, message: RegExp) => {
    const result = routineSchema.safeParse({ ...weekday, ...value });
    assert.equal(result.success, false);
    assert.match(result.error!.issues.map((i) => i.message).join(' '), message);
  };
  bad({ schedule_mode: 'cycle', rest_days: [] }, /운동일과 휴식일 수를 입력하세요/);
  bad(
    { schedule_mode: 'cycle', cycle: { train_days: 3, rest_days: 1 } },
    /주기 방식에는 휴식 요일을 지정하지 않습니다/,
  );
  bad(
    { cycle: { train_days: 3, rest_days: 1 } },
    /요일 방식에는 운동·휴식 주기를 지정하지 않습니다/,
  );
  bad(
    { schedule_mode: 'cycle', rest_days: [], cycle: { train_days: 0, rest_days: 1 } },
    /Number must be greater than or equal to 1/,
  );
});

test('a rest today on a cycle routine moves the remaining targets to later training days', () => {
  const plan = cyclePlan(3, 3, 1);
  const days = arrangeTargets(plan, []).days.filter((d) => !d.rest && d.target);
  const today = days[1].date;
  const rested = arrangeTargets(plan, [today]);
  const after = rested.days.filter((d) => d.target);
  assert.equal(rested.days.find((d) => d.date === today)!.rest, true);
  assert.equal(after[1].target!.order, 2, 'the rested target moves to the next training day');
  assert.equal(after[1].date, days[2].date);
  assert.equal(routineProgress(plan, [], today).today_plan?.target?.order, 2);
});

test('the routine form preview uses the same cycle schedule as the server', () => {
  const input = {
    ...autoRoutineInput(),
    schedule_mode: 'cycle' as const,
    cycle: { train_days: 3, rest_days: 1 },
    rest_days: [],
  };
  const plan = routineSchema.parse(input) as RoutinePlan;
  // Loaded like the #28 parity test: the frontend module runs in a vm with its contract stub.
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../../frontend/src/progression.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    { exports, Date, Math, require: () => ({ defaultWeightStep: 5 }) },
  );
  type Row = { week: number; weight: number; reps: number };
  const previewTargets = exports.previewTargets as (plan: unknown) => { rows: Row[] }[][];
  const preview = JSON.parse(JSON.stringify(previewTargets(input))) as { rows: Row[] }[][];
  const server = arrangeTargets(plan, [], [], '2000-01-01').days.filter((d) => d.target);
  assert.deepEqual(
    preview[0][0].rows.map((r) => `${r.week}-${r.weight}x${r.reps}`),
    server.map((d) => `${d.week}-${d.target!.exercises[0].weight}x${d.target!.exercises[0].reps}`),
  );
});

test(
  'a cycle routine is stored and read back with its cycle schedule',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
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
    let id: number | undefined;
    try {
      const plan = { ...cyclePlan(4, 4, 1), name: `Cycle88-${randomUUID()}` };
      const created = await call('/routines', 'POST', plan);
      assert.equal(created.status, 201);
      id = created.data.id;
      const read = (await call(`/routines/${id}`)).data;
      assert.equal(read.schedule_mode, 'cycle');
      assert.deepEqual(read.cycle, { train_days: 4, rest_days: 1 });
      assert.deepEqual(read.schedule, routineSchedule(plan));
      assert.equal(read.schedule[4].date, '2024-03-05', 'day 5 is the rest day, day 6 trains');
      const legacy = await call('/routines', 'POST', {
        ...plan,
        splits: plan.splits.map((s) => ({ ...s, body_parts: ['팔', '이두', '삼두'] })),
      });
      assert.equal(legacy.status, 201, 'the legacy 팔 is still accepted');
      // Migration 014 lets the exercise mapping store 이두·삼두 (#32 table).
      const mapped = await call('/exercise-body-parts', 'PUT', {
        exercise: plan.name,
        body_parts: ['삼두', '이두'],
      });
      assert.equal(mapped.status, 200);
      assert.deepEqual(mapped.data.body_parts, ['이두', '삼두']);
      await pool.query('DELETE FROM exercise_body_parts WHERE exercise=lower($1)', [plan.name]);
      await pool.query('DELETE FROM routines WHERE id=$1', [legacy.data.id]);
    } finally {
      try {
        if (id) await pool.query('DELETE FROM routines WHERE id=$1', [id]);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await pool.end();
      }
    }
  },
);
