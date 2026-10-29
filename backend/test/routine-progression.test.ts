import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

import { type RoutinePlan, routineSchema } from '../src/domain.js';
import * as progress from '../src/progress.js';
import { autoRoutineInput, routineInput } from './routine-fixture.js';

// #28 rule changes (issue comments "규칙 변경 — 자동 점진 과부하와 기본 3세트" and
// "규칙 변경 — 주 단위가 아니라 분할(운동일) 단위로 진행"): one step per session of
// the exercise's split,
// double progression from the entered current performance, weight steps of the
// exercise's increment (#86: 5 kg by default), bodyweight adds reps only, deloads at 4/8/12 are 90%
// of the previous non-deload target weight with the same reps, and real records
// decide whether a target advances or is held.
type Records = {
  date: string;
  exercise: string;
  sets: { weight: number; reps: number; completed?: boolean | null }[];
}[];
type Api = {
  progressionStep(
    level: { weight: number; reps: number },
    ex: { rep_min?: number; rep_max?: number; weight_step?: number },
  ): { level: { weight: number; reps: number }; kind: string };
  deloadWeight(weight: number): number;
  arrangeTargets(
    plan: RoutinePlan,
    rests: readonly string[],
    records?: Records,
    today?: string,
  ): {
    days: {
      date: string;
      week: number;
      rest: boolean;
      target: {
        order: number;
        session?: number;
        split_index: number;
        split_name: string;
        week: number;
        is_deload: boolean;
        exercises: {
          exercise: string;
          sets: number;
          weight: number;
          reps: number;
          projected?: boolean;
          result?: string | null;
        }[];
      } | null;
    }[];
    excluded: { order: number }[];
  };
};
const api = progress as unknown as Api;
const parse = (value: unknown) => routineSchema.safeParse(value);
const plan = () => {
  const parsed = parse(autoRoutineInput());
  assert.equal(parsed.success, true, 'auto routine without manual weeks is valid');
  return parsed.data as RoutinePlan;
};
const beforeStart = '2024-03-01';
// 2-split variant: three workouts a week alternate A/B/A, then B/A/B.
const twoSplitInput = () => ({
  ...autoRoutineInput(),
  split_count: 2,
  splits: [
    {
      name: '분할 A',
      body_parts: ['가슴'],
      exercises: [
        { exercise: '벤치프레스', sets: 3, weight: 100, reps: 10, rep_min: 8, rep_max: 12 },
      ],
    },
    {
      name: '분할 B',
      body_parts: ['하체-앞'],
      exercises: [{ exercise: '스쿼트', sets: 3, weight: 50, reps: 10, rep_min: 8, rep_max: 12 }],
    },
  ],
});
const twoSplit = () => routineSchema.parse(twoSplitInput()) as RoutinePlan;
// Targets of one exercise in date order, as "weekxreps@week" strings.
const sessions = (
  name: string,
  records: Records = [],
  today = beforeStart,
  rests: string[] = [],
  routine = plan(),
) =>
  api.arrangeTargets(routine, rests, records, today).days.flatMap((d) => {
    const e = d.target?.exercises.find((x) => x.exercise === name);
    return e ? [`${e.weight}x${e.reps}`] : [];
  });
const at = (
  date: string,
  name: string,
  records: Records = [],
  today = beforeStart,
  rests: string[] = [],
) => {
  const day = api.arrangeTargets(plan(), rests, records, today).days.find((d) => d.date === date);
  return { day, exercise: day?.target?.exercises.find((x) => x.exercise === name) };
};
const benchSets = (date: string, sets: [number, number, (boolean | null)?][]) => ({
  date,
  exercise: '벤치프레스',
  sets: sets.map(([weight, reps, completed]) => ({ weight, reps, completed })),
});
const three = (date: string, w: number, r: number) =>
  benchSets(date, [
    [w, r],
    [w, r],
    [w, r],
  ]);

test('auto routines validate a rep range and reject manual week amounts; manual stays compatible', () => {
  const auto = autoRoutineInput();
  assert.equal(parse({ ...auto, weeks: routineInput(1).weeks }).success, false);
  const badRange = structuredClone(auto);
  badRange.splits[0].exercises[0].rep_min = 13;
  assert.equal(parse(badRange).success, false, 'rep_min must not exceed rep_max');
  const missing = structuredClone(auto) as { splits: { exercises: Record<string, unknown>[] }[] };
  delete missing.splits[0].exercises[0].rep_max;
  assert.equal(parse(missing).success, false, 'auto exercises need a rep range');
  // Saved #27 routines have no progression field and keep their manual weeks.
  const manual = routineInput(2);
  const parsed = parse(manual);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, manual);
  assert.equal(parse({ ...manual, weeks: undefined }).success, false, 'manual needs 12 weeks');
});

test('weight increment is 5 kg by default and the exercise own step otherwise (#86)', () => {
  const top = { weight: 40, reps: 12 };
  const range = { rep_min: 8, rep_max: 12 };
  assert.deepEqual(api.progressionStep(top, range).level, { weight: 45, reps: 8 });
  for (const [weight_step, weight] of [
    [2.5, 42.5],
    [1.25, 41.25],
    [10, 50],
  ])
    assert.deepEqual(api.progressionStep(top, { ...range, weight_step }).level, {
      weight,
      reps: 8,
    });
  assert.equal(api.progressionStep({ weight: 0, reps: 12 }, range).kind, 'hold');
  assert.equal(api.deloadWeight(100), 90);
  assert.equal(api.deloadWeight(105), 95, '94.5 kg rounds to the nearest 2.5 kg');
  assert.equal(api.deloadWeight(42.5), 37.5);
  assert.equal(api.deloadWeight(0), 0);
});

test('a full-body routine trained 3x a week advances one step per session', () => {
  const bench = sessions('벤치프레스');
  assert.equal(bench.length, 36);
  assert.deepEqual(bench.slice(0, 9), [
    '100x10', // week 1, session 1: the entered current performance
    '100x11',
    '100x12',
    '105x8', // 13 reps exceed 12: +5 kg (5% of 100) and back to 8
    '105x9',
    '105x10',
    '105x11',
    '105x12',
    '110x8',
  ]);
  assert.deepEqual(
    bench.slice(9, 12),
    ['100x8', '100x8', '100x8'],
    'every week-4 session is a deload at 90% of 110 kg rounded to 2.5 kg, same reps',
  );
  assert.deepEqual(
    bench.slice(12, 15),
    ['110x9', '110x10', '110x11'],
    'week 5 resumes from the pre-deload target',
  );
  assert.deepEqual(bench.slice(21, 24), ['102.5x12', '102.5x12', '102.5x12'], 'week 8 deload');
  assert.deepEqual(bench.slice(33), ['112.5x11', '112.5x11', '112.5x11'], 'week 12 deload');
  assert.deepEqual(sessions('덤벨 컬').slice(0, 15), [
    '40x12',
    '45x8', // #86: +5 kg by default, also for light weights
    '45x9',
    '45x10',
    '45x11',
    '45x12',
    '50x8',
    '50x9',
    '50x10',
    '45x10', // week 4 deload: 90% of 50 kg
    '45x10',
    '45x10',
    '50x11',
    '50x12',
    '55x8',
  ]);
  // A 2.5 kg step set for the exercise (also for saved routines) is used instead.
  const custom = progress.withWeightSteps(plan(), { '덤벨 컬': 2.5 }) as RoutinePlan;
  assert.deepEqual(sessions('덤벨 컬', [], beforeStart, [], custom).slice(0, 7), [
    '40x12',
    '42.5x8',
    '42.5x9',
    '42.5x10',
    '42.5x11',
    '42.5x12',
    '45x8',
  ]);
  const pullUp = sessions('맨몸 풀업');
  assert.deepEqual(pullUp.slice(0, 4), ['0x10', '0x11', '0x12', '0x12']);
  assert.ok(
    pullUp.every((t) => t.startsWith('0x')),
    'bodyweight only adds reps up to the max, then holds',
  );
  const { days } = api.arrangeTargets(plan(), [], [], beforeStart);
  assert.ok(days.every((d) => d.target!.exercises.every((e) => e.sets === 3)));
  assert.ok(days.every((d) => d.target!.exercises.every((e) => e.projected === true)));
});

test('a 2-split routine 3x a week advances each exercise only on its own split sessions', () => {
  const { days } = api.arrangeTargets(twoSplit(), [], [], beforeStart);
  assert.deepEqual(
    days.slice(0, 6).map((d) => d.target!.split_name),
    ['분할 A', '분할 B', '분할 A', '분할 B', '분할 A', '분할 B'],
    'A/B/A in week 1, then B/A/B in week 2',
  );
  assert.deepEqual(sessions('벤치프레스', [], beforeStart, [], twoSplit()).slice(0, 7), [
    '100x10', // w1 #1
    '100x11', // w1 #3
    '100x12', // w2 #2
    '105x8', // w3 #1
    '105x9', // w3 #3
    '95x9', // w4 #2 deload
    '105x10', // w5 #1 resumes
  ]);
  assert.deepEqual(sessions('스쿼트', [], beforeStart, [], twoSplit()).slice(0, 7), [
    '50x10', // w1 #2
    '50x11', // w2 #1
    '50x12', // w2 #3
    '55x8', // w3 #2: +5 kg default increment (#86)
    '50x8', // w4 #1 deload: 90% of 55 kg rounded to 2.5 kg
    '50x8', // w4 #3 deload
    '55x9', // w5 #2
  ]);
});

test('each session window decides whether the next session advances or holds', () => {
  const friday = '2024-03-08'; // week 1, session 3
  const metFirst = [three('2024-03-05', 100, 10)]; // inside session 1's window (Mon–Tue)
  assert.deepEqual(
    sessions('벤치프레스', metFirst, friday).slice(0, 4),
    ['100x10', '100x11', '100x11', '100x12'],
    'session 1 met → session 2 advances; session 2 has no record → session 3 holds',
  );
  assert.equal(at('2024-03-04', '벤치프레스', metFirst, friday).exercise?.result, 'achieved');
  assert.equal(at('2024-03-06', '벤치프레스', metFirst, friday).exercise?.result, 'missed');
  assert.equal(at(friday, '벤치프레스', metFirst, friday).exercise?.projected, false);
  assert.equal(at('2024-03-11', '벤치프레스', metFirst, friday).exercise?.projected, true);
  const short = [
    benchSets('2024-03-04', [
      [100, 10],
      [100, 10],
      [100, 9],
    ]),
  ];
  assert.deepEqual(
    sessions('벤치프레스', short, '2024-03-06').slice(0, 3),
    ['100x10', '100x10', '100x11'],
    'one set short holds the target; the open session is projected as met',
  );
  assert.deepEqual(
    sessions('벤치프레스', [], '2024-03-06').slice(0, 2),
    ['100x10', '100x10'],
    'a closed window without a record holds',
  );
  // A record on the next session's day belongs to that next session.
  const recordToday = [three('2024-03-06', 100, 10)];
  assert.equal(
    at('2024-03-04', '벤치프레스', recordToday, '2024-03-06').exercise?.result,
    'missed',
  );
  assert.equal(
    at('2024-03-06', '벤치프레스', recordToday, '2024-03-06').exercise?.result,
    'achieved',
  );
});

test('an achieved session marked hard holds the next target; medium and easy advance (#83)', () => {
  const friday = '2024-03-08';
  const met = (feedback: 'hard' | 'medium' | 'easy' | null) => [
    { ...three('2024-03-05', 100, 10), feedback },
  ];
  assert.deepEqual(
    sessions('벤치프레스', met('hard'), friday).slice(0, 2),
    ['100x10', '100x10'],
    'hard → same target next session',
  );
  assert.equal(at('2024-03-04', '벤치프레스', met('hard'), friday).exercise?.result, 'achieved');
  for (const feedback of ['medium', 'easy', null] as const)
    assert.deepEqual(
      sessions('벤치프레스', met(feedback), friday).slice(0, 2),
      ['100x10', '100x11'],
      `${String(feedback)} → advances as before`,
    );
  // Feedback of a workout outside the session window does not affect it.
  const hardLater = [
    three('2024-03-05', 100, 10),
    { ...three('2024-03-06', 100, 11), feedback: 'hard' as const },
  ];
  assert.deepEqual(sessions('벤치프레스', hardLater, friday).slice(0, 3), [
    '100x10',
    '100x11',
    '100x11',
  ]);
});

test('only completed sets count when the completed flag is present', () => {
  const today = '2024-03-06';
  const oneIncomplete = [
    benchSets('2024-03-04', [
      [100, 10],
      [100, 10],
      [100, 10, false],
    ]),
  ];
  assert.deepEqual(sessions('벤치프레스', oneIncomplete, today).slice(0, 2), ['100x10', '100x10']);
  const extra = [
    benchSets('2024-03-04', [
      [100, 10, true],
      [100, 10, false],
      [100, 10, true],
      [100, 10, true],
    ]),
  ];
  assert.deepEqual(sessions('벤치프레스', extra, today).slice(0, 2), ['100x10', '100x11']);
  const legacy = [
    benchSets('2024-03-04', [
      [100, 10, null],
      [100, 10],
      [100, 10],
    ]),
  ];
  assert.deepEqual(
    sessions('벤치프레스', legacy, today).slice(0, 2),
    ['100x10', '100x11'],
    'sets without the column count as performed',
  );
});

test('deload sessions are not judged and the session after them resumes', () => {
  const today = '2024-04-03'; // week 5, session 2
  const records = [
    three('2024-03-04', 100, 10),
    three('2024-03-06', 100, 11),
    three('2024-03-08', 100, 12),
    three('2024-03-11', 105, 8),
    three('2024-03-13', 105, 9),
    three('2024-03-15', 105, 10),
    three('2024-03-18', 105, 11),
    three('2024-03-20', 105, 12),
    three('2024-03-22', 110, 8),
  ];
  const bench = sessions('벤치프레스', records, today);
  assert.deepEqual(bench.slice(9, 12), ['100x8', '100x8', '100x8'], 'no deload records needed');
  assert.deepEqual(
    bench.slice(12, 15),
    ['110x9', '110x9', '110x10'],
    'week 5 starts from the pre-deload step; its missed first session holds',
  );
  const deload = at('2024-03-25', '벤치프레스', records, today).exercise!;
  assert.equal(deload.result ?? null, null, 'deload sessions have no outcome');
});

test('rest-day shifts keep plan order, deload attribution and per-session values', () => {
  const rest = '2024-03-08'; // week 1, session 3
  const shifted = api.arrangeTargets(plan(), [rest], [], beforeStart);
  const moved = shifted.days.find((d) => d.date === '2024-03-11')!;
  assert.equal(moved.target?.week, 1, 'the third week-1 target slides to Monday');
  assert.deepEqual([moved.target?.exercises[0].weight, moved.target?.exercises[0].reps], [100, 12]);
  assert.deepEqual(
    shifted.excluded.map((t) => t.order),
    [36],
  );
  assert.deepEqual(
    sessions('벤치프레스', [], beforeStart, [rest]),
    sessions('벤치프레스').slice(0, 35),
    'without records the shifted sessions keep their values in plan order',
  );
  // A record on the shifted Monday belongs to the moved session's window.
  const late = [three('2024-03-11', 100, 12)];
  assert.equal(
    at('2024-03-11', '벤치프레스', late, '2024-03-13', [rest]).exercise?.result,
    'achieved',
  );
  // Resting the first week-3 session pushes a week-3 target into calendar week 4
  // and a week-4 deload target into calendar week 5; each keeps its own role.
  const later = api.arrangeTargets(plan(), ['2024-03-18'], [], beforeStart);
  const intoWeek4 = later.days.find((d) => d.date === '2024-03-25')!;
  assert.equal(intoWeek4.target?.week, 3);
  assert.equal(intoWeek4.target?.is_deload, false);
  assert.equal(intoWeek4.target?.exercises[0].weight, 110);
  const intoWeek5 = later.days.find((d) => d.date === '2024-04-01')!;
  assert.equal(intoWeek5.target?.is_deload, true);
  assert.equal(intoWeek5.target?.exercises[0].weight, 100);
});

test('the routine form preview uses the same per-session progression as the server', () => {
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../../frontend/src/progression.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    // The preview reads the default increment from the shared contract.
    { exports, Date, Math, require: () => ({ defaultWeightStep: 5 }) },
  );
  type Row = { week: number; session: number; weight: number; reps: number; kind: string };
  const preview = exports.previewTargets as (
    plan: unknown,
  ) => { exercise: string; rows: Row[] }[][];
  assert.equal(typeof preview, 'function', 'frontend exposes previewTargets');
  for (const [input, routine] of [
    [autoRoutineInput(), plan()],
    [twoSplitInput(), twoSplit()],
  ] as const) {
    // JSON round trip: arrays from the vm context have a different realm prototype.
    const splits = JSON.parse(JSON.stringify(preview(input))) as ReturnType<typeof preview>;
    for (const split of splits)
      for (const ex of split)
        assert.deepEqual(
          ex.rows.map((r) => `${r.weight}x${r.reps}`),
          sessions(ex.exercise, [], beforeStart, [], routine),
          `${ex.exercise} preview matches the server`,
        );
    const { days } = api.arrangeTargets(routine, [], [], beforeStart);
    const first = splits[0][0].rows;
    const serverFirst = days.filter((d) => d.target?.split_index === 0);
    assert.deepEqual(
      first.map((r) => `${r.week}-${r.session}`),
      serverFirst.map((d) => `${d.target!.week}-${(d.target as { session?: number }).session}`),
      'week and session labels match',
    );
  }
  const firstEx = (
    JSON.parse(JSON.stringify(preview(autoRoutineInput()))) as ReturnType<typeof preview>
  )[0][0];
  assert.deepEqual(
    firstEx.rows.slice(0, 4).map((r) => r.kind),
    ['start', 'reps', 'reps', 'weight'],
  );
});
