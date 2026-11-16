import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardioWeeklyTargets } from '../src/contract.js';
import { type RoutinePlan, routineSchema } from '../src/domain.js';
import { arrangeTargets, routineProgress, weekCardio } from '../src/progress.js';
import { autoRoutineInput, routineInput } from './routine-fixture.js';

// #117 (2026-11-16 decision): +10% a week compounded from week 1, shown rounded to 1 minute
// or 0.1 km; weeks 4, 8 and 12 are 80% of the week before, and the next week resumes from it.
const targets = (item: { minutes?: number; distance_km?: number }) =>
  cardioWeeklyTargets(item)!.map((w) => w.target);

test('a timed cardio item grows 10% a week with 80% deloads that do not set the next week back', () => {
  assert.deepEqual(targets({ minutes: 30 }), [30, 33, 36, 29, 40, 44, 48, 39, 53, 58, 64, 51]);
  assert.deepEqual(
    cardioWeeklyTargets({ minutes: 30 })!
      .filter((w) => w.deload)
      .map((w) => w.week),
    [4, 8, 12],
  );
});

test('a distance item steps in 0.1 km without floating point noise', () => {
  assert.deepEqual(
    targets({ distance_km: 5 }),
    [5, 5.5, 6.1, 4.8, 6.7, 7.3, 8.1, 6.4, 8.9, 9.7, 10.7, 8.6],
  );
  for (const target of targets({ distance_km: 1.3 }))
    assert.equal(target, Number(target.toFixed(1)));
});

test('a short target still grows instead of rounding back every week', () => {
  assert.deepEqual(targets({ minutes: 4 }), [4, 4, 5, 4, 5, 6, 6, 5, 7, 8, 9, 7]);
  assert.deepEqual(
    targets({ distance_km: 0.3 }),
    [0.3, 0.3, 0.4, 0.3, 0.4, 0.4, 0.5, 0.4, 0.5, 0.6, 0.6, 0.5],
  );
});

test('targets stop at the input maximum, deloads stay 80% of it, and intervals have none', () => {
  assert.deepEqual(
    targets({ minutes: 500 }),
    [500, 550, 600, 480, 600, 600, 600, 480, 600, 600, 600, 480],
  );
  assert.deepEqual(
    targets({ distance_km: 450 }),
    [450, 495, 500, 400, 500, 500, 500, 400, 500, 500, 500, 400],
  );
  assert.equal(cardioWeeklyTargets({}), null);
});

// Part 2: each session's target carries its split's cardio for that routine week.
const withCardio = (input: ReturnType<typeof routineInput> | ReturnType<typeof autoRoutineInput>) =>
  routineSchema.parse({
    ...input,
    splits: input.splits.map((s, i) =>
      i === 0
        ? {
            ...s,
            cardio: [
              { kind: 'running', intensity: 'zone2', minutes: 30 },
              { kind: 'rowing', intensity: 'recovery', distance_km: 5 },
              {
                kind: 'indoor_cycling',
                intensity: 'interval',
                interval: { repeats: 8, work_sec: 60, recovery_sec: 90 },
              },
            ],
          }
        : s,
    ),
  }) as RoutinePlan;

test("a session target carries its split's cardio with that week's time or distance", () => {
  const plan = withCardio(routineInput(2));
  assert.deepEqual(weekCardio(plan, 0, 3), [
    { kind: 'running', intensity: 'zone2', minutes: 36 },
    { kind: 'rowing', intensity: 'recovery', distance_km: 6.1 },
    {
      kind: 'indoor_cycling',
      intensity: 'interval',
      interval: { repeats: 8, work_sec: 60, recovery_sec: 90 },
    },
  ]);
  assert.equal(weekCardio(plan, 0, 4)![0].minutes, 29, 'week 4 is a deload');
  assert.equal(weekCardio(plan, 1, 3), undefined, 'a split without cardio has none');
  assert.equal(plan.splits[0].cardio![0].minutes, 30, 'the plan itself is not changed');

  const { days } = arrangeTargets(plan, []);
  for (const day of days.filter((d) => d.target)) {
    const target = day.target!;
    if (target.split_index === 0) assert.deepEqual(target.cardio, weekCardio(plan, 0, target.week));
    else assert.ok(!('cardio' in target), 'no cardio key on a split without cardio');
  }
});

test('a rest moves a session with the cardio of its planned week, and auto routines carry it', () => {
  const plan = withCardio(routineInput(1));
  const first = arrangeTargets(plan, []).days.filter((d) => d.target);
  // Resting on week 1's last workout day pushes its target into week 2's first slot.
  const lastOfWeek1 = first.filter((d) => d.week === 1).at(-1)!;
  const moved = arrangeTargets(plan, [lastOfWeek1.date]).days.find(
    (d) => d.target?.order === lastOfWeek1.target!.order,
  )!;
  assert.equal(moved.week, 2);
  assert.equal(moved.target!.cardio![0].minutes, 30, 'still week 1 cardio');

  const auto = withCardio(autoRoutineInput());
  const progress = routineProgress(auto, [], auto.start_date);
  assert.deepEqual(progress.today_plan?.target?.cardio?.[0], {
    kind: 'running',
    intensity: 'zone2',
    minutes: 30,
    // Part 3: today's window is open and nothing is recorded yet.
    result: null,
  });
});

// Part 3 (2026-11-16 decision): a same-type record in the session's window that meets the
// week's target marks the item done; an interval needs only the type; one record counts once.
test('cardio items are judged against saved records in their session window', () => {
  // One split, Mon/Wed/Fri from Monday 2098-03-03: windows 03-03..03-04, 03-05..03-06, 03-07..
  const input = routineInput(1);
  input.start_date = '2098-03-03';
  const plan = routineSchema.parse({
    ...input,
    splits: [
      {
        ...input.splits[0],
        cardio: [
          { kind: 'running', intensity: 'zone2', minutes: 30 },
          { kind: 'rowing', intensity: 'recovery', distance_km: 5 },
          {
            kind: 'stairs',
            intensity: 'interval',
            interval: { repeats: 6, work_sec: 30, recovery_sec: 30 },
          },
        ],
      },
    ],
  }) as RoutinePlan;
  const record = (id: number, date: string, kind: string, minutes: number, km: number | null) => ({
    id,
    date,
    kind,
    duration_sec: minutes * 60,
    distance_km: km,
  });
  const progress = routineProgress(
    plan,
    [],
    '2098-03-07',
    [],
    [
      // Session 1: 30 min run meets 30; 5.0 km row meets 5; a short stairs session counts.
      record(1, '2098-03-03', 'running', 30, 5),
      record(2, '2098-03-04', 'rowing', 25, 5),
      record(3, '2098-03-04', 'stairs', 5, null),
      // Session 2: 29:59 is short of 30 min; the row is 4.9 km; a walk is the wrong type.
      { ...record(4, '2098-03-05', 'running', 30, null), duration_sec: 1799 },
      record(5, '2098-03-06', 'rowing', 40, 4.9),
      record(6, '2098-03-06', 'walking', 60, 6),
      // Session 3 (today, window still open): one run, which cannot count twice.
      record(7, '2098-03-07', 'running', 31, null),
    ],
  );
  const results = progress.days
    .filter((d) => d.target)
    .slice(0, 4)
    .map((d) => d.target!.cardio!.map((c) => c.result));
  assert.deepEqual(results, [
    ['achieved', 'achieved', 'achieved'],
    ['missed', 'missed', 'missed'],
    ['achieved', null, null],
    [null, null, null],
  ]);
  // Sessions on or before today: 3 sessions × 3 items, 4 done.
  assert.deepEqual(progress.cardio_summary, { done: 4, planned: 9 });
  assert.equal(progress.today_plan?.target?.cardio?.[0].result, 'achieved');
  // The 12-week table shows the same judged targets.
  assert.deepEqual(
    progress.weeks[0].entries[1].target.cardio?.map((c) => c.result),
    ['missed', 'missed', 'missed'],
  );
});

test("a record on the next session's date belongs to that session, and deload targets apply", () => {
  const input = routineInput(1);
  input.start_date = '2098-03-03';
  const plan = routineSchema.parse({
    ...input,
    splits: [
      { ...input.splits[0], cardio: [{ kind: 'running', intensity: 'zone2', minutes: 30 }] },
    ],
  }) as RoutinePlan;
  const run = (id: number, date: string, minutes: number) => ({
    id,
    date,
    kind: 'running',
    duration_sec: minutes * 60,
    distance_km: null,
  });
  const early = routineProgress(plan, [], '2098-03-05', [], [run(1, '2098-03-05', 30)]);
  const [first, second] = early.days.filter((d) => d.target);
  assert.equal(first.target!.cardio![0].result, 'missed', 'its window closed on 03-05');
  assert.equal(second.target!.cardio![0].result, 'achieved');

  // Week 4 is a deload at 80% of week 3 (36 → 29 min): 29 minutes meets it.
  const week4 = routineProgress(plan, [], '2098-03-24', [], [run(1, '2098-03-24', 29)]);
  assert.equal(week4.today_plan?.week, 4);
  assert.equal(week4.today_plan?.target?.cardio?.[0].minutes, 29);
  assert.equal(week4.today_plan?.target?.cardio?.[0].result, 'achieved');
});

test('a routine without cardio has no cardio summary and unchanged targets', () => {
  const plan = routineSchema.parse(routineInput(2)) as RoutinePlan;
  const progress = routineProgress(
    plan,
    [],
    '2024-03-04',
    [],
    [{ id: 1, date: '2024-03-04', kind: 'running', duration_sec: 1800, distance_km: 5 }],
  );
  assert.equal(progress.cardio_summary, null);
  assert.ok(progress.days.every((d) => !d.target || !('cardio' in d.target)));
});
