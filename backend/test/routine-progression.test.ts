import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { routineSchema, type RoutinePlan } from '../src/domain.js';
import * as progress from '../src/progress.js';
import { autoRoutineInput, routineInput } from './routine-fixture.js';

// #28 rule change (issue comment "규칙 변경 — 자동 점진 과부하와 기본 3세트"):
// double progression from the entered current performance, ~5% weight steps in
// 2.5 kg units (min 2.5 kg), bodyweight adds reps only, deloads at 4/8/12 are 90%
// of the previous week's target weight with the same reps, and real records
// decide whether a target advances or is held.
type Records = {
  date: string;
  exercise: string;
  sets: { weight: number; reps: number; completed?: boolean | null }[];
}[];
type Api = {
  incrementFor(weight: number): number;
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
const weekly = (name: string, records: Records = [], today = beforeStart, rests: string[] = []) => {
  const { days } = api.arrangeTargets(plan(), rests, records, today);
  const byWeek = new Map<number, string>();
  for (const d of days)
    if (d.target && !byWeek.has(d.target.week)) {
      const e = d.target.exercises.find((x) => x.exercise === name)!;
      byWeek.set(d.target.week, `${e.weight}x${e.reps}`);
    }
  return [...byWeek.values()];
};
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

test('weight increment is about 5% in 2.5 kg steps with a 2.5 kg minimum', () => {
  assert.equal(api.incrementFor(100), 5);
  assert.equal(api.incrementFor(105), 5);
  assert.equal(api.incrementFor(75), 5);
  assert.equal(api.incrementFor(40), 2.5);
  assert.equal(api.incrementFor(10), 2.5);
  assert.equal(api.incrementFor(200), 10);
  assert.equal(api.deloadWeight(100), 90);
  assert.equal(api.deloadWeight(105), 95, '94.5 kg rounds to the nearest 2.5 kg');
  assert.equal(api.deloadWeight(42.5), 37.5);
  assert.equal(api.deloadWeight(0), 0);
});

test('projected targets add a rep weekly, reset to the minimum with a heavier weight, and deload', () => {
  assert.deepEqual(weekly('벤치프레스'), [
    '100x10',
    '100x11',
    '100x12',
    '90x12', // deload: 90% of week 3, same reps
    '105x8', // resumes from week 3: 13 reps exceed 12, so +5 kg and back to 8
    '105x9',
    '105x10',
    '95x10',
    '105x11',
    '105x12',
    '110x8',
    '100x8',
  ]);
  assert.deepEqual(weekly('덤벨 컬'), [
    '40x12',
    '42.5x8',
    '42.5x9',
    '37.5x9',
    '42.5x10',
    '42.5x11',
    '42.5x12',
    '37.5x12',
    '45x8',
    '45x9',
    '45x10',
    '40x10',
  ]);
  assert.deepEqual(
    weekly('맨몸 풀업'),
    [
      '0x10',
      '0x11',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
      '0x12',
    ],
    'bodyweight only adds reps up to the maximum, then holds',
  );
  const { days } = api.arrangeTargets(plan(), [], [], beforeStart);
  assert.ok(days.every((d) => d.target!.exercises.every((e) => e.sets === 3)));
  assert.ok(days.every((d) => d.target!.exercises.every((e) => e.projected === true)));
});

test('a met target advances and a missed target is held, shifting the remaining weeks', () => {
  const today = '2024-03-11'; // Monday of week 2; week 1's window has closed.
  const met = [
    benchSets('2024-03-06', [
      [100, 10],
      [100, 11],
      [102.5, 10],
    ]),
  ];
  assert.deepEqual(weekly('벤치프레스', met, today).slice(0, 3), ['100x10', '100x11', '100x12']);
  assert.equal(at('2024-03-04', '벤치프레스', met, today).exercise?.result, 'achieved');
  const missed = [
    benchSets('2024-03-06', [
      [100, 10],
      [100, 10],
      [100, 9],
    ]),
  ];
  assert.deepEqual(
    weekly('벤치프레스', missed, today).slice(0, 6),
    ['100x10', '100x10', '100x11', '90x11', '100x12', '105x8'],
    'one set short of the reps keeps the same target and recomputes later weeks',
  );
  assert.equal(at('2024-03-04', '벤치프레스', missed, today).exercise?.result, 'missed');
  const none = weekly('벤치프레스', [], today);
  assert.deepEqual(none.slice(0, 2), ['100x10', '100x10'], 'no record in a closed week holds');
  const todayTarget = at(today, '벤치프레스', missed, today).exercise!;
  assert.equal(todayTarget.projected, false, "today's target is firm");
  assert.equal(at('2024-03-13', '벤치프레스', missed, today).exercise?.projected, true);
});

test('only completed sets count when the completed flag is present', () => {
  const today = '2024-03-11';
  const oneIncomplete = [
    benchSets('2024-03-06', [
      [100, 10],
      [100, 10],
      [100, 10, false],
    ]),
  ];
  assert.deepEqual(weekly('벤치프레스', oneIncomplete, today).slice(0, 2), ['100x10', '100x10']);
  const extra = [
    benchSets('2024-03-06', [
      [100, 10, true],
      [100, 10, false],
      [100, 10, true],
      [100, 10, true],
    ]),
  ];
  assert.deepEqual(weekly('벤치프레스', extra, today).slice(0, 2), ['100x10', '100x11']);
  const legacy = [
    benchSets('2024-03-06', [
      [100, 10, null],
      [100, 10],
      [100, 10],
    ]),
  ];
  assert.deepEqual(
    weekly('벤치프레스', legacy, today).slice(0, 2),
    ['100x10', '100x11'],
    'sets without the column count as performed',
  );
});

test('an open week is projected as met until its window closes', () => {
  const wednesday = '2024-03-06';
  assert.deepEqual(weekly('벤치프레스', [], wednesday).slice(0, 2), ['100x10', '100x11']);
  assert.equal(at('2024-03-04', '벤치프레스', [], wednesday).exercise?.result ?? null, null);
  const recordToday = [
    benchSets(wednesday, [
      [100, 10],
      [100, 10],
      [100, 10],
    ]),
  ];
  assert.equal(at('2024-03-04', '벤치프레스', recordToday, wednesday).exercise?.result, 'achieved');
});

test('deload pauses progression even when its own week is missed', () => {
  const today = '2024-04-08'; // Monday of week 6
  const met = (date: string, w: number, r: number) =>
    benchSets(date, [
      [w, r],
      [w, r],
      [w, r],
    ]);
  const records = [
    met('2024-03-04', 100, 10),
    met('2024-03-11', 100, 11),
    met('2024-03-18', 100, 12),
  ];
  assert.deepEqual(weekly('벤치프레스', records, today).slice(0, 6), [
    '100x10',
    '100x11',
    '100x12',
    '90x12',
    '105x8',
    '105x8', // week 5 had no record, so week 6 holds 105x8
  ]);
});

test('rest-day shifts keep each target week and its progression values', () => {
  const rest = '2024-03-08'; // Friday of week 1
  const shifted = api.arrangeTargets(plan(), [rest], [], beforeStart);
  const moved = shifted.days.find((d) => d.date === '2024-03-11')!;
  assert.equal(moved.target?.week, 1, 'the third week-1 target slides to Monday');
  assert.equal(moved.target?.exercises[0].weight, 100);
  assert.equal(moved.target?.exercises[0].reps, 10);
  const next = shifted.days.find((d) => d.date === '2024-03-13')!;
  assert.equal(next.target?.week, 2);
  assert.equal(next.target?.exercises[0].reps, 11);
  assert.deepEqual(
    shifted.excluded.map((t) => t.order),
    [36],
  );
  assert.deepEqual(weekly('벤치프레스', [], beforeStart, [rest]), weekly('벤치프레스'));
  // A record on the shifted Monday still belongs to week 1's window.
  const lateRecord = [
    benchSets('2024-03-11', [
      [100, 10],
      [100, 10],
      [100, 10],
    ]),
  ];
  assert.equal(
    at('2024-03-04', '벤치프레스', lateRecord, '2024-03-13', [rest]).exercise?.result,
    'achieved',
  );
});

test('the routine form preview uses the same progression as the server', () => {
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('../../frontend/src/progression.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    { exports, Date, Math },
  );
  const preview = exports.previewTargets as (plan: unknown) => {
    exercise: string;
    rows: { week: number; weight: number; reps: number; sets: number; kind: string }[];
  }[][];
  assert.equal(typeof preview, 'function', 'frontend exposes previewTargets');
  const input = autoRoutineInput();
  // JSON round trip: arrays from the vm context have a different realm prototype.
  const rows = JSON.parse(JSON.stringify(preview(input)[0])) as ReturnType<typeof preview>[0];
  for (const [i, name] of input.splits[0].exercises.map((e) => e.exercise).entries())
    assert.deepEqual(
      rows[i].rows.map((r) => `${r.weight}x${r.reps}`),
      weekly(name),
      `${name} preview matches the server`,
    );
  assert.deepEqual(
    rows[0].rows.map((r) => r.kind),
    [
      'start',
      'reps',
      'reps',
      'deload',
      'weight',
      'reps',
      'reps',
      'deload',
      'reps',
      'reps',
      'weight',
      'deload',
    ],
  );
});
