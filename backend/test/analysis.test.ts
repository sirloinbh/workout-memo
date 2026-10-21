import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import {
  analyze,
  bodyPartMappingSchema,
  estimatedOneRepMax,
  type AnalysisSet,
} from '../src/analysis.js';

let nextId = 1;
const set = (
  date: string,
  exercise: string,
  weight: number | string,
  reps: number,
  unknown_base = false,
): AnalysisSet => ({
  id: nextId++,
  date,
  exercise,
  exercise_key: exercise.trim().toLowerCase(),
  weight,
  reps,
  unknown_base,
});
const part = (week: ReturnType<typeof analyze>['weeks'][number], name: string) =>
  week.parts.find((p) => p.body_part === name)!;

test('empty records produce no PRs and zero Monday-start weeks for every part', () => {
  const result = analyze([], [], '2024-12-30', '2025-01-12');
  assert.deepEqual(result.exercises, []);
  assert.deepEqual(
    result.weeks.map((w) => [w.week_start, w.week_end, w.sets, w.volume]),
    [
      ['2024-12-30', '2025-01-05', 0, 0],
      ['2025-01-06', '2025-01-12', 0, 0],
    ],
  );
  assert.deepEqual(
    result.weeks[0].parts.map((p) => p.body_part),
    // #88: 이두·삼두 replace 팔, which is listed only while some exercise uses it.
    ['가슴', '등', '어깨', '이두', '삼두', '하체-앞', '하체-뒤', '복근', '미분류'],
  );
  assert.ok(result.weeks.every((w) => w.parts.every((p) => p.sets === 0 && p.volume === 0)));
});

test('Epley estimate uses total kg within 1-10 reps and skips bodyweight or unknown base', () => {
  assert.equal(estimatedOneRepMax(100, 5, false), 116.67);
  assert.equal(estimatedOneRepMax(100, 10, false), 133.33);
  assert.equal(estimatedOneRepMax(120, 1, false), 120);
  assert.equal(estimatedOneRepMax(100, 11, false), null);
  assert.equal(estimatedOneRepMax(0, 5, false), null);
  assert.equal(estimatedOneRepMax(200, 3, true), null);
});

test('PRs tie on the earliest date, group normalized names and separate actual from estimated 1RM', () => {
  const rows = [
    set('2024-01-02', 'Bench Press', '100.00', 5),
    set('2024-01-03', 'Bench Press', 0, 20),
    set('2024-01-09', 'bench press', 100, 5),
    set('2024-01-10', 'BENCH press', 120, 1),
    set('2024-01-11', 'bench press', 200, 3, true),
    set('2024-01-12', 'Bench press', 90, 12),
  ];
  const [bench, ...others] = analyze(rows, [], '2024-01-01', '2024-01-31').exercises;
  assert.equal(others.length, 0, 'Case variants are one exercise like goal judgment');
  assert.equal(bench.exercise, 'Bench press', 'The latest spelling is shown');
  assert.equal(bench.set_count, 6);
  assert.equal(bench.unknown_base_sets, 1);
  assert.equal(bench.bodyweight_sets, 1);
  // Recorded total weight is the max-weight PR even when the base weight is unknown.
  assert.deepEqual(bench.prs.max_weight, {
    value: 200,
    weight: 200,
    reps: 3,
    date: '2024-01-11',
    ties: 1,
  });
  assert.deepEqual(bench.prs.max_reps, {
    value: 20,
    weight: 0,
    reps: 20,
    date: '2024-01-03',
    ties: 1,
  });
  assert.deepEqual(bench.prs.max_set_volume, {
    value: 1080,
    weight: 90,
    reps: 12,
    date: '2024-01-12',
    ties: 1,
  });
  assert.deepEqual(bench.prs.actual_1rm, {
    value: 120,
    weight: 120,
    reps: 1,
    date: '2024-01-10',
    ties: 1,
  });
  // 200x3 (unknown base) and 90x12 (over 10 reps) are not estimated.
  assert.deepEqual(bench.prs.estimated_1rm, {
    value: 120,
    weight: 120,
    reps: 1,
    date: '2024-01-10',
    ties: 1,
  });

  const tied = analyze(
    [
      set('2024-02-05', 'Row', 80, 8),
      set('2024-02-01', 'Row', 80, 8),
      set('2024-02-03', 'Row', 70, 8),
    ],
    [],
    '2024-02-01',
    '2024-02-29',
  ).exercises[0];
  for (const pr of [tied.prs.max_weight, tied.prs.max_set_volume, tied.prs.estimated_1rm]) {
    assert.equal(pr?.date, '2024-02-01', 'A tied PR keeps the first achievement date');
    assert.equal(pr?.ties, 2);
  }
  assert.equal(tied.prs.max_reps?.ties, 3);
  assert.equal(tied.prs.actual_1rm, null);
});

test('bodyweight-only exercises have no weight, volume or 1RM PRs', () => {
  const [pullup] = analyze(
    [set('2024-03-01', '턱걸이', 0, 8), set('2024-03-02', '턱걸이', 0, 8)],
    [],
    '2024-03-01',
    '2024-03-31',
  ).exercises;
  assert.equal(pullup.prs.max_weight, null);
  assert.equal(pullup.prs.max_set_volume, null);
  assert.equal(pullup.prs.estimated_1rm, null);
  assert.equal(pullup.prs.actual_1rm, null);
  assert.equal(pullup.prs.max_reps?.ties, 2);
  assert.deepEqual(pullup.trend, [
    {
      date: '2024-03-01',
      max_weight: null,
      max_reps: 8,
      max_set_volume: null,
      estimated_1rm: null,
    },
    {
      date: '2024-03-02',
      max_weight: null,
      max_reps: 8,
      max_set_volume: null,
      estimated_1rm: null,
    },
  ]);
});

test('trends and weeks include both period ends and exclude adjacent dates; PRs use all rows', () => {
  const rows = [
    set('2024-12-29', 'Squat', 300, 1),
    set('2024-12-30', 'Squat', 100, 10),
    set('2024-12-30', 'Squat', 110, 5),
    set('2025-01-05', 'Squat', 120, 3),
    set('2025-01-06', 'Squat', 500, 1),
  ];
  const result = analyze(rows, [], '2024-12-30', '2025-01-05');
  const [squat] = result.exercises;
  assert.deepEqual(squat.trend, [
    {
      date: '2024-12-30',
      max_weight: 110,
      max_reps: 10,
      max_set_volume: 1000,
      estimated_1rm: 133.33,
    },
    { date: '2025-01-05', max_weight: 120, max_reps: 3, max_set_volume: 360, estimated_1rm: 132 },
  ]);
  assert.equal(squat.prs.max_weight?.value, 500, 'All-time PR is not limited to the period');
  assert.equal(result.weeks.length, 1);
  assert.equal(result.weeks[0].sets, 3);
  assert.equal(result.weeks[0].volume, 1910);
});

test('each mapped part counts a multi-part set fully and unmapped sets are 미분류', () => {
  const rows = [
    set('2024-06-03', 'Bench Press', 100, 10),
    set('2024-06-04', 'bench press', 50.25, 4),
    set('2024-06-09', 'Plank', 0, 1),
    set('2024-06-10', 'Bench Press', 100, 1),
  ];
  const mappings = [
    { exercise: 'bench press', body_part: '어깨' },
    { exercise: 'bench press', body_part: '가슴' },
  ];
  const result = analyze(rows, mappings, '2024-06-03', '2024-06-16');
  assert.deepEqual(result.exercises.find((x) => x.key === 'bench press')?.body_parts, [
    '가슴',
    '어깨',
  ]);
  const [first, second] = result.weeks;
  assert.equal(first.sets, 3);
  assert.equal(first.volume, 1201);
  assert.deepEqual(part(first, '가슴'), { body_part: '가슴', sets: 2, volume: 1201 });
  assert.deepEqual(part(first, '어깨'), { body_part: '어깨', sets: 2, volume: 1201 });
  assert.deepEqual(part(first, '미분류'), { body_part: '미분류', sets: 1, volume: 0 });
  assert.equal(part(first, '등').sets, 0);
  const sum = first.parts.reduce((n, p) => n + p.sets, 0);
  assert.ok(sum > first.sets, 'Part totals may exceed the overall weekly total');
  assert.equal(second.week_start, '2024-06-10');
  assert.equal(part(second, '가슴').sets, 1);
});

test('recomputes from the current rows after an edit or delete', () => {
  const rows = [set('2024-04-01', 'Deadlift', 140, 5), set('2024-04-02', 'Deadlift', 150, 5)];
  assert.equal(
    analyze(rows, [], '2024-04-01', '2024-04-07').exercises[0].prs.max_weight?.value,
    150,
  );
  const edited = rows.map((r) => (r.date === '2024-04-02' ? { ...r, weight: 130 } : r));
  const afterEdit = analyze(edited, [], '2024-04-01', '2024-04-07');
  assert.equal(afterEdit.exercises[0].prs.max_weight?.value, 140);
  assert.equal(afterEdit.weeks[0].volume, 1350);
  const afterDelete = analyze([], [], '2024-04-01', '2024-04-07');
  assert.deepEqual(afterDelete.exercises, []);
  assert.equal(afterDelete.weeks[0].sets, 0);
});

async function withServer(pool: Pool, run: (base: string) => Promise<void>) {
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/api`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('analysis and mapping APIs reject invalid input before touching storage', async () => {
  let queries = 0;
  const pool = {
    query: async () => {
      queries++;
      return { rows: [] };
    },
    connect: async () => {
      queries++;
      throw Error('not expected');
    },
  } as unknown as Pool;
  await withServer(pool, async (base) => {
    for (const query of [
      'from=2024-02-30&to=2024-03-01',
      'from=2024-2-01&to=2024-03-01',
      'to=2024-03-01',
      'from=2025-01-05&to=2024-12-30',
      'from=2024-01-01&to=2025-01-07',
    ]) {
      const response = await fetch(`${base}/analysis?${query}`);
      assert.equal(response.status, 400, query);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    for (const body of [
      { exercise: '', body_parts: ['가슴'] },
      { exercise: 'Bench', body_parts: ['가슴', '가슴'] },
      { exercise: 'Bench', body_parts: ['하체'] },
      { exercise: 'Bench' },
      { exercise: 'x'.repeat(121), body_parts: [] },
    ]) {
      const response = await fetch(`${base}/exercise-body-parts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });
  assert.equal(queries, 0);
});

test('analysis API limits sets to the Seoul service date and returns computed results', async () => {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('AS today')) return { rows: [{ today: '2024-01-03' }] };
      if (sql.includes('FROM sets'))
        return {
          rows: [
            set('2024-01-01', 'Squat', '100.50', 2),
            set('2024-01-03', 'squat', '90', 3, true),
          ],
        };
      return { rows: [{ exercise: 'squat', body_part: '하체-앞' }] };
    },
  } as unknown as Pool;
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/analysis?from=2024-01-01&to=2024-01-07`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.today, '2024-01-03');
    assert.equal(data.exercises[0].exercise, 'squat');
    assert.deepEqual(data.exercises[0].body_parts, ['하체-앞']);
    assert.equal(data.exercises[0].prs.estimated_1rm.value, 107.2);
    assert.equal(
      data.weeks[0].parts.find((p: { body_part: string }) => p.body_part === '하체-앞').sets,
      2,
    );
    assert.equal(data.weeks[0].volume, 471);
  });
  const sets = calls.find((c) => c.sql.includes('FROM sets'))!;
  assert.match(sets.sql, /w\.date <= \$1/);
  assert.deepEqual(sets.params, ['2024-01-03']);
  assert.match(sets.sql, /lower\(trim\(s\.exercise\)\)/);
  assert.match(calls[0].sql, /Asia\/Seoul/);
});

test('a legacy 팔 mapping is still counted and listed next to 이두·삼두 (#88)', () => {
  const result = analyze(
    [{ ...set('2025-01-06', 'Curl', '20', 10), exercise_key: 'curl' }],
    [
      { exercise: 'curl', body_part: '이두' },
      { exercise: 'curl', body_part: '팔' },
    ],
    '2025-01-06',
    '2025-01-12',
  );
  assert.deepEqual(result.exercises[0].body_parts, ['팔', '이두']);
  const names = result.weeks[0].parts.map((p) => p.body_part);
  assert.deepEqual(names.slice(3, 6), ['팔', '이두', '삼두']);
  for (const name of ['팔', '이두'])
    assert.equal(result.weeks[0].parts.find((p) => p.body_part === name)!.sets, 1);
});

test('body part mappings accept 이두·삼두 and the legacy 팔 (#88)', () => {
  for (const body_parts of [['이두'], ['삼두', '이두'], ['팔']])
    assert.equal(bodyPartMappingSchema.safeParse({ exercise: 'Curl', body_parts }).success, true);
  assert.equal(
    bodyPartMappingSchema.safeParse({ exercise: 'Curl', body_parts: ['전완'] }).success,
    false,
  );
});
