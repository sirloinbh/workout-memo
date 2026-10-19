import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { routineSchema, routineSchedule, type RoutinePlan } from '../src/domain.js';
import {
  arrangeTargets,
  planEndDate,
  restPreview,
  restUnavailable,
  routineProgress,
  weekExercises,
} from '../src/progress.js';
import { routineInput } from './routine-fixture.js';

// Fixture: starts Thursday 2024-02-29 (a rest day), trains Mon/Wed/Fri, two splits,
// 36 training slots. Weeks alternate +2.5 kg / +1 rep, week 5 is +7.25 kg and
// 4/8/12 are deloads of 12.5 kg.
const plan = routineSchema.parse(routineInput(2)) as RoutinePlan;
const slots = routineSchedule(plan).map((s) => s.date);

test('week targets apply only that week’s manual change to the base values', () => {
  const [squat1, lunge1] = weekExercises(plan, 0, 1);
  assert.deepEqual(squat1, {
    exercise: '스쿼트',
    sets: 3,
    weight: 102.75,
    reps: 10,
    base: { sets: 3, weight: 100.25, reps: 10 },
  });
  assert.equal(lunge1.weight, 2.5, 'bodyweight 0 kg also receives the planned increase');
  const [squat2] = weekExercises(plan, 0, 2);
  assert.equal(squat2.weight, 100.25, 'no accumulation from week 1');
  assert.equal(squat2.reps, 11);
  assert.equal(weekExercises(plan, 0, 5)[0].weight, 107.5, 'week 5 keeps the manual 7.25 kg');
  const [squat4, lunge4] = weekExercises(plan, 1, 4);
  assert.equal(squat4.weight, 87.75);
  assert.equal(lunge4.weight, 0, 'deload never yields a negative total weight');
  const sets = structuredClone(plan);
  sets.weeks[7] = { week: 8, kind: 'deload', amount: 5, deload_metric: 'sets' };
  assert.equal(weekExercises(sets, 0, 8)[0].sets, 1, 'deload keeps at least one set');
});

test('without rests every target stays on its original slot and nothing is excluded', () => {
  const { days, excluded } = arrangeTargets(plan, []);
  assert.equal(days.length, 36);
  assert.equal(excluded.length, 0);
  days.forEach((day, index) => {
    assert.equal(day.target?.order, index + 1);
    assert.equal(day.target?.week, day.week);
    assert.equal(day.target?.split_index, index % 2, 'splits rotate in plan order');
  });
  assert.equal(planEndDate(plan), '2024-05-22');
});

test('a rest shifts every remaining target by one training slot and excludes the last', () => {
  const rest = slots[1]; // Monday 2024-03-04
  assert.equal(rest, '2024-03-04');
  const { days, excluded } = arrangeTargets(plan, [rest]);
  assert.deepEqual(
    days.map((d) => d.date),
    slots,
    'dates, rest weekdays and the fixed end date do not move',
  );
  assert.equal(days[0].target?.order, 1, 'earlier days are untouched');
  assert.equal(days[1].rest, true);
  assert.equal(days[1].target, null);
  for (let i = 2; i < 36; i++) assert.equal(days[i].target?.order, i);
  assert.deepEqual(
    excluded.map((t) => [t.order, t.week, t.is_deload]),
    [[36, 12, true]],
    'the overflowing last target is kept as excluded, not deleted',
  );
});

test('consecutive rests on different days accumulate and exclude one target each', () => {
  const { days, excluded } = arrangeTargets(plan, [slots[1], slots[2]]);
  assert.equal(days[3].target?.order, 2);
  assert.deepEqual(
    excluded.map((t) => t.order),
    [35, 36],
  );
  // Choosing the same date twice is still a single rest.
  assert.deepEqual(arrangeTargets(plan, [slots[1], slots[1]]), arrangeTargets(plan, [slots[1]]));
});

test('week, increment and deload attribution follow the original plan order', () => {
  // Rest on the first slot of week 3: the last week-3 target slides into week 4.
  const firstWeek3 = 6;
  const { days } = arrangeTargets(plan, [slots[firstWeek3]]);
  const lastWeek3Target = days[9];
  assert.equal(lastWeek3Target.week, 4, 'calendar week of the slot');
  assert.equal(lastWeek3Target.target?.week, 3, 'target keeps its planned week');
  assert.equal(lastWeek3Target.target?.is_deload, false);
  assert.equal(lastWeek3Target.target?.exercises[0].weight, 102.75, 'week 3 increase is kept');
  const lastDeload = days[12];
  assert.equal(lastDeload.week, 5);
  assert.equal(lastDeload.target?.week, 4);
  assert.equal(lastDeload.target?.is_deload, true, 'a deload target remains a deload');
  assert.equal(lastDeload.target?.exercises[0].weight, 87.75);
});

test('resting on the last training day excludes only that day’s target', () => {
  const last = slots.at(-1)!;
  assert.equal(restUnavailable(plan, [], last), null);
  const preview = restPreview(plan, [], last)!;
  assert.deepEqual(preview.moves, [
    { order: 36, week: 12, is_deload: true, split_name: '분할 2', from: last, to: null },
  ]);
  assert.deepEqual(
    preview.excluded.map((t) => t.order),
    [36],
  );
});

test('rest is refused for duplicates, non-training days and dates outside the plan', () => {
  assert.match(restUnavailable(plan, [slots[1]], slots[1])!, /이미/);
  assert.equal(restPreview(plan, [slots[1]], slots[1]), null);
  assert.match(restUnavailable(plan, [], '2024-03-05')!, /운동일이 아닙니다/); // Tuesday
  assert.match(restUnavailable(plan, [], '2024-02-28')!, /기간/);
  assert.match(restUnavailable(plan, [], '2024-05-24')!, /기간/);
});

test('the preview equals the applied result for every training day and prior rests', () => {
  for (const prior of [[], [slots[0]], [slots[3], slots[10]]]) {
    for (const day of slots.filter((d) => d > (prior.at(-1) ?? ''))) {
      const preview = restPreview(plan, prior, day)!;
      const after = arrangeTargets(plan, [...prior, day]);
      const before = arrangeTargets(plan, prior);
      for (const move of preview.moves) {
        const landed = after.days.find((d) => d.target?.order === move.order);
        assert.equal(move.to, landed?.date ?? null);
        assert.equal(before.days.find((d) => d.target?.order === move.order)?.date, move.from);
      }
      assert.equal(
        preview.moves.length,
        before.days.filter((d) => d.target && d.date >= day).length,
      );
      const known = new Set(before.excluded.map((t) => t.order));
      assert.deepEqual(
        preview.excluded,
        after.excluded.filter((t) => !known.has(t.order)),
        'newly excluded target is the one the preview showed',
      );
      assert.equal(preview.excluded.length, 1, 'exactly one more target is excluded');
    }
  }
});

test('progress lists today, this week and a 12-week table with excluded targets', () => {
  const today = slots[1];
  const progress = routineProgress(plan, [slots[0]], today);
  assert.equal(progress.current_week, 1);
  assert.equal(progress.today_plan?.target?.order, 1, 'target 1 moved to today after rest');
  assert.deepEqual(
    progress.this_week.map((d) => d.date),
    ['2024-03-01', '2024-03-04', '2024-03-06'],
  );
  assert.equal(progress.weeks.length, 12);
  const week12 = progress.weeks[11];
  assert.ok(week12.entries.some((e) => e.excluded && e.target.order === 36 && e.date === null));
  assert.equal(
    progress.weeks.reduce((n, w) => n + w.entries.length, 0),
    36,
    'every target is listed exactly once, scheduled or excluded',
  );
  assert.equal(progress.can_rest, true);
  assert.equal(progress.rested_today, false);
  const rested = routineProgress(plan, [slots[0], today], today);
  assert.equal(rested.rested_today, true);
  assert.equal(rested.can_rest, false);
  assert.equal(rested.rest_preview, null);
});

// ---- API without a database: a scripted pool records each statement. ----
type Script = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } | Error;
function fakePool(script: Script) {
  const log: string[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    log.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
    const result = script(sql, params);
    if (result instanceof Error) throw result;
    return { rowCount: result.rows.length, ...result };
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
  } as unknown as Pool;
  return { pool, log };
}
async function call(pool: Pool, today: string, path: string, method: string, body?: unknown) {
  const server = createApp(pool, { today: () => today }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const routineRow = { id: 7, plan };
function scripted(rests: string[], failOn?: RegExp) {
  return fakePool((sql) => {
    if (failOn?.test(sql)) return new Error('connection lost');
    if (/FROM routines/.test(sql)) return { rows: [routineRow] };
    if (/SELECT rest_date/.test(sql)) return { rows: rests.map((rest_date) => ({ rest_date })) };
    if (/FROM sets/.test(sql)) return { rows: [] };
    return { rows: [] };
  });
}

test('rest API validates the date against the server’s Asia/Seoul today', async () => {
  const untouched = fakePool(() => new Error('must not reach storage'));
  const stale = await call(untouched.pool, slots[1], '/routines/7/rests', 'POST', {
    date: slots[0],
  });
  assert.equal(stale.status, 409);
  assert.equal(untouched.log.length, 0);
  const invalid = await call(untouched.pool, slots[1], '/routines/7/rests', 'POST', {
    date: '2024-02-30',
  });
  assert.equal(invalid.status, 400);
  const badId = await call(untouched.pool, slots[1], '/routines/x/rests', 'POST', {
    date: slots[1],
  });
  assert.equal(badId.status, 400);
  const lateCancel = await call(
    untouched.pool,
    slots[2],
    `/routines/7/rests/${slots[1]}`,
    'DELETE',
  );
  assert.equal(lateCancel.status, 409, 'a rest can be cancelled only on the same day');
  assert.equal(untouched.log.length, 0);
});

test('rest API applies once, ignores a duplicate and refuses a non-training day', async () => {
  const first = scripted([]);
  const applied = await call(first.pool, slots[1], '/routines/7/rests', 'POST', {
    date: slots[1],
  });
  assert.equal(applied.status, 201);
  assert.equal(applied.data.applied, true);
  assert.equal(applied.data.rested_today, true);
  assert.deepEqual(
    first.log.filter((q) => /^(BEGIN|COMMIT|ROLLBACK|INSERT)/.test(q)),
    ['BEGIN', 'INSERT INTO routine_rests(routine_id,', 'COMMIT'],
  );
  const again = scripted([slots[1]]);
  const duplicate = await call(again.pool, slots[1], '/routines/7/rests', 'POST', {
    date: slots[1],
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.applied, false);
  assert.ok(!again.log.some((q) => q.startsWith('INSERT')), 'duplicate never inserts');
  assert.deepEqual(duplicate.data.days, applied.data.days, 'same schedule as the first apply');
  const tuesday = scripted([]);
  const refused = await call(tuesday.pool, '2024-03-05', '/routines/7/rests', 'POST', {
    date: '2024-03-05',
  });
  assert.equal(refused.status, 409);
  assert.ok(tuesday.log.includes('ROLLBACK'));
  assert.ok(!tuesday.log.some((q) => q.startsWith('INSERT') || q === 'COMMIT'));
});

for (const [stage, failOn] of [['the commit', /^COMMIT/]] as const)
  test(`a failure at ${stage} after the insert rolls back and reports an error`, async () => {
    const broken = scripted([slots[0]], failOn);
    const result = await call(broken.pool, slots[1], '/routines/7/rests', 'POST', {
      date: slots[1],
    });
    assert.equal(result.status, 500);
    assert.equal(result.data.rested_today, undefined, 'no success payload before commit');
    assert.ok(broken.log.some((q) => q.startsWith('INSERT')));
    assert.equal(broken.log.at(-1), 'ROLLBACK');
  });

test('progress API guides the user when no routine has started', async () => {
  const empty = fakePool(() => ({ rows: [] }));
  const result = await call(empty.pool, '2024-03-04', '/routine-progress', 'GET');
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { today: '2024-03-04', routine: null });
});
