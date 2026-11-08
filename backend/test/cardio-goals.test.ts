import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type CardioGoalSession,
  goalPeriods,
  judgeCardioGoal,
  suggestCardioGoal,
} from '../src/cardio-goals.js';
import { type CardioGoal, cardioGoalSchema } from '../src/domain.js';

// #116: cardio goal judgment without a database. 2026-11-02 is a Monday, 2026-11-08 a Sunday.
const goal = (input: Partial<CardioGoal> & Pick<CardioGoal, 'goal_type'>): CardioGoal =>
  cardioGoalSchema.parse({ start_date: '2026-11-02', deadline: '2026-11-29', ...input });
const run = (
  date: string,
  distance_km: number | null,
  duration_sec = 1800,
  kind: CardioGoalSession['kind'] = 'running',
): CardioGoalSession => ({ date, kind, duration_sec, distance_km });
const periodOf = (result: ReturnType<typeof judgeCardioGoal>) => {
  assert.equal(result.progress.kind, 'period');
  return result.progress;
};

test('weeks run Monday to Sunday and months follow the calendar', () => {
  assert.deepEqual(goalPeriods('week', '2026-11-04', '2026-11-10'), [
    { start: '2026-11-02', end: '2026-11-08' },
    { start: '2026-11-09', end: '2026-11-15' },
  ]);
  assert.deepEqual(goalPeriods('month', '2026-01-31', '2026-03-01'), [
    { start: '2026-01-01', end: '2026-01-31' },
    { start: '2026-02-01', end: '2026-02-28' },
    { start: '2026-03-01', end: '2026-03-31' },
  ]);
});

test('a weekly distance goal is judged under, exactly at and over the target', () => {
  const weekly = goal({ goal_type: 'distance', period: 'week', target_distance_km: 15 });
  const today = '2026-11-05';
  const under = judgeCardioGoal(weekly, [run('2026-11-03', 14.999)], today);
  assert.equal(under.achieved, false);
  assert.equal(periodOf(under).current?.value, 14.999);
  // 0.1 + 0.2 style sums are kept at 1 m, so exactly 15 km reaches the target.
  const exact = judgeCardioGoal(
    weekly,
    [run('2026-11-02', 5.1), run('2026-11-03', 4.7), run('2026-11-04', 5.2)],
    today,
  );
  assert.equal(periodOf(exact).current?.value, 15);
  assert.equal(exact.achieved, true);
  const over = judgeCardioGoal(weekly, [run('2026-11-02', 21)], today);
  assert.equal(over.achieved, true);
  assert.equal(periodOf(over).periods_achieved, 1);
});

test('the week boundary splits Sunday from Monday', () => {
  const weekly = goal({ goal_type: 'count', period: 'week', target_count: 2 });
  const result = judgeCardioGoal(
    weekly,
    [run('2026-11-08', 3), run('2026-11-09', 3), run('2026-11-10', 3)],
    '2026-11-10',
  );
  const { periods, current } = periodOf(result);
  assert.deepEqual(
    periods.slice(0, 2).map((p) => [p.start, p.value, p.achieved]),
    [
      ['2026-11-02', 1, false],
      ['2026-11-09', 2, true],
    ],
  );
  assert.equal(current?.start, '2026-11-09');
  assert.equal(result.achieved, true);
});

test('no sessions means zero progress and nothing achieved', () => {
  const weekly = goal({ goal_type: 'duration', period: 'week', target_duration_sec: 3600 });
  const result = judgeCardioGoal(weekly, [], '2026-11-05');
  assert.equal(result.achieved, false);
  const progress = periodOf(result);
  assert.equal(progress.current?.value, 0);
  assert.equal(progress.periods.length, 4);
  assert.equal(progress.periods_achieved, 0);
  for (const type of ['record_time', 'longest_distance'] as const) {
    const record = judgeCardioGoal(
      goal({
        goal_type: type,
        kind: 'running',
        target_distance_km: 5,
        target_duration_sec: type === 'record_time' ? 1800 : null,
      }),
      [],
      '2026-11-05',
    );
    assert.deepEqual(record, { achieved: false, progress: { kind: 'record', best: null } });
  }
});

test('a week cut by the start or deadline counts only days inside the goal and keeps the target', () => {
  // D3: starts on Wednesday 11-04 and ends on Tuesday 11-10.
  const weekly = goal({
    goal_type: 'count',
    period: 'week',
    target_count: 2,
    start_date: '2026-11-04',
    deadline: '2026-11-10',
  });
  const result = judgeCardioGoal(
    weekly,
    [run('2026-11-02', 5), run('2026-11-04', 5), run('2026-11-10', 5), run('2026-11-11', 5)],
    '2026-11-20',
  );
  const progress = periodOf(result);
  assert.deepEqual(
    progress.periods.map((p) => [p.start, p.end, p.value, p.achieved]),
    [
      ['2026-11-02', '2026-11-08', 1, false],
      ['2026-11-09', '2026-11-15', 1, false],
    ],
  );
  // After the deadline there is no current period, so the goal is not "achieved now".
  assert.equal(progress.current, null);
  assert.equal(result.achieved, false);
});

test('sessions after today, of another kind, or without a distance do not count', () => {
  const running = goal({
    goal_type: 'distance',
    period: 'month',
    kind: 'running',
    target_distance_km: 10,
  });
  const sessions = [
    run('2026-11-03', 6),
    run('2026-11-04', 6, 1800, 'outdoor_cycling'),
    run('2026-11-05', null, 3600),
    run('2026-11-07', 6),
  ];
  const result = judgeCardioGoal(running, sessions, '2026-11-06');
  assert.equal(periodOf(result).current?.value, 6);
  assert.equal(result.achieved, false);
  // Every kind (null) counts the cycling too; time goals count the session without a distance.
  const any = judgeCardioGoal({ ...running, kind: null }, sessions, '2026-11-06');
  assert.equal(periodOf(any).current?.value, 12);
  const time = judgeCardioGoal(
    goal({ goal_type: 'duration', period: 'month', target_duration_sec: 7200 }),
    sessions,
    '2026-11-06',
  );
  assert.equal(periodOf(time).current?.value, 7200);
  assert.equal(time.achieved, true);
});

test('a time record needs one session covering the distance within the time', () => {
  const fiveK = goal({
    goal_type: 'record_time',
    kind: 'running',
    target_distance_km: 5,
    target_duration_sec: 1800,
  });
  const today = '2026-11-20';
  // D5: 10 km in 55 minutes is not a 5 km in 30 minutes; 4.9 km in 25 minutes is too short.
  const slow = judgeCardioGoal(
    fiveK,
    [run('2026-11-03', 10, 3300), run('2026-11-04', 4.9, 1500)],
    today,
  );
  assert.deepEqual(slow, { achieved: false, progress: { kind: 'record', best: 3300 } });
  const exact = judgeCardioGoal(fiveK, [run('2026-11-05', 5, 1800)], today);
  assert.deepEqual(exact, { achieved: true, progress: { kind: 'record', best: 1800 } });
  const faster = judgeCardioGoal(
    fiveK,
    [run('2026-11-05', 5.2, 1750), run('2026-11-06', 5, 1900)],
    today,
  );
  assert.deepEqual(faster, { achieved: true, progress: { kind: 'record', best: 1750 } });
  // A session before the start does not count.
  const early = judgeCardioGoal(fiveK, [run('2026-11-01', 5, 1500)], today);
  assert.equal(early.achieved, false);
});

test('a longest distance record takes the longest single session', () => {
  const half = goal({ goal_type: 'longest_distance', kind: 'running', target_distance_km: 21.097 });
  const today = '2026-11-20';
  const short = judgeCardioGoal(half, [run('2026-11-03', 15), run('2026-11-10', 21.096)], today);
  assert.deepEqual(short, { achieved: false, progress: { kind: 'record', best: 21.096 } });
  const done = judgeCardioGoal(half, [run('2026-11-10', 21.097)], today);
  assert.equal(done.achieved, true);
});

test('the goal schema accepts each type only with its own targets', () => {
  const base = { start_date: '2026-11-02', deadline: '2026-11-29' };
  const ok = [
    { goal_type: 'distance', period: 'week', target_distance_km: 15 },
    { goal_type: 'duration', period: 'month', kind: 'swimming', target_duration_sec: 36000 },
    { goal_type: 'count', period: 'week', target_count: 3 },
    { goal_type: 'record_time', kind: 'running', target_distance_km: 5, target_duration_sec: 1800 },
    { goal_type: 'longest_distance', kind: 'rowing', target_distance_km: 10 },
  ];
  for (const input of ok)
    assert.ok(cardioGoalSchema.safeParse({ ...base, ...input }).success, input.goal_type);
  const bad: [Record<string, unknown>, string][] = [
    [{ goal_type: 'distance', target_distance_km: 15 }, 'period'],
    [{ goal_type: 'distance', period: 'week' }, 'target_distance_km'],
    [
      { goal_type: 'count', period: 'week', target_count: 3, target_distance_km: 5 },
      'target_distance_km',
    ],
    [{ goal_type: 'record_time', target_distance_km: 5, target_duration_sec: 1800 }, 'kind'],
    [{ goal_type: 'record_time', kind: 'running', target_distance_km: 5 }, 'target_duration_sec'],
    [
      { goal_type: 'longest_distance', kind: 'running', period: 'week', target_distance_km: 5 },
      'period',
    ],
    [{ goal_type: 'count', period: 'week', target_count: 1.5 }, 'target_count'],
    [{ goal_type: 'distance', period: 'week', target_distance_km: 1.0005 }, 'target_distance_km'],
    [{ goal_type: 'count', period: 'year', target_count: 3 }, 'period'],
    [{ goal_type: 'count', period: 'week', target_count: 3, deadline: '2026-11-01' }, 'deadline'],
  ];
  for (const [input, path] of bad) {
    const result = cardioGoalSchema.safeParse({ ...base, ...input });
    assert.equal(result.success, false, JSON.stringify(input));
    assert.ok(
      result.error!.issues.some((i) => i.path.join('.') === path),
      `${JSON.stringify(input)} → ${path}`,
    );
  }
  // Five years at most: 2026-11-02 + 1826 days is 2031-11-02.
  assert.ok(
    cardioGoalSchema.safeParse({
      ...base,
      goal_type: 'count',
      period: 'week',
      target_count: 3,
      deadline: '2031-11-02',
    }).success,
  );
  const long = cardioGoalSchema.safeParse({
    ...base,
    goal_type: 'count',
    period: 'week',
    target_count: 3,
    deadline: '2031-11-03',
  });
  assert.equal(long.error!.issues[0].message, '목표 기간은 5년(1826일) 이하로 정하세요');
  // Korean particles follow the last syllable.
  const missing = cardioGoalSchema.safeParse({ ...base, goal_type: 'duration', period: 'week' });
  assert.equal(missing.error!.issues[0].message, '목표 시간을 입력하세요');
});

// #251: next goals (2026-11-08 decisions N1, N2, N4) from the goal's own targets.
test('the next goal raises each target by its rule and keeps the goal length from today', () => {
  const today = '2026-11-20';
  const weekly = goal({
    goal_type: 'distance',
    period: 'week',
    kind: 'running',
    target_distance_km: 15,
  });
  // 4 weeks (11-02 ~ 11-29, 27 days) again from today.
  assert.deepEqual(suggestCardioGoal(weekly, today), {
    ...weekly,
    target_distance_km: 16.5,
    start_date: '2026-11-20',
    deadline: '2026-12-17',
  });
  // Rounding: 0.1 km steps, but at least one step up (1 km × 1.1 = 1.1; 0.3 × 1.1 = 0.33 → 0.4).
  const small = goal({ goal_type: 'distance', period: 'week', target_distance_km: 0.3 });
  assert.equal(suggestCardioGoal(small, today)!.target_distance_km, 0.4);
  // Swimming moves in 50 m: 1500 m × 1.1 = 1650 m.
  const swim = goal({ goal_type: 'longest_distance', kind: 'swimming', target_distance_km: 1.5 });
  assert.equal(suggestCardioGoal(swim, today)!.target_distance_km, 1.65);
  const swim2 = goal({ goal_type: 'longest_distance', kind: 'swimming', target_distance_km: 1.2 });
  assert.equal(suggestCardioGoal(swim2, today)!.target_distance_km, 1.3);
  // Time totals: +10% in whole minutes (150 min → 165 min; 61 s → 120 s).
  const time = goal({ goal_type: 'duration', period: 'week', target_duration_sec: 9000 });
  assert.equal(suggestCardioGoal(time, today)!.target_duration_sec, 9900);
  const tiny = goal({ goal_type: 'duration', period: 'week', target_duration_sec: 61 });
  assert.equal(suggestCardioGoal(tiny, today)!.target_duration_sec, 120);
  // Counts: +1.
  const count = goal({ goal_type: 'count', period: 'week', target_count: 3 });
  assert.equal(suggestCardioGoal(count, today)!.target_count, 4);
  // Time records: 3% faster in 5 s steps, at least 5 s; the distance stays.
  const fiveK = goal({
    goal_type: 'record_time',
    kind: 'running',
    target_distance_km: 5,
    target_duration_sec: 1800,
  });
  assert.deepEqual(
    [
      suggestCardioGoal(fiveK, today)!.target_duration_sec,
      suggestCardioGoal(fiveK, today)!.target_distance_km,
    ],
    [1745, 5],
  );
  const short = goal({
    goal_type: 'record_time',
    kind: 'rowing',
    target_distance_km: 0.5,
    target_duration_sec: 100,
  });
  assert.equal(suggestCardioGoal(short, today)!.target_duration_sec, 95);
  // At least 5 s faster even when 3% rounds to less: 102 s → 95 s (not 100 s).
  const odd = goal({
    goal_type: 'record_time',
    kind: 'rowing',
    target_distance_km: 0.5,
    target_duration_sec: 102,
  });
  assert.equal(suggestCardioGoal(odd, today)!.target_duration_sec, 95);
  // Every suggestion is a valid goal for the API.
  for (const g of [weekly, small, swim, swim2, time, tiny, count, fiveK, short])
    assert.ok(cardioGoalSchema.safeParse(suggestCardioGoal(g, today)).success, g.goal_type);
});

test('no next goal past the allowed range', () => {
  const today = '2026-11-20';
  assert.equal(
    suggestCardioGoal(goal({ goal_type: 'count', period: 'week', target_count: 1000 }), today),
    null,
  );
  assert.equal(
    suggestCardioGoal(
      goal({ goal_type: 'distance', period: 'month', target_distance_km: 9500 }),
      today,
    ),
    null,
  );
  assert.equal(
    suggestCardioGoal(
      goal({
        goal_type: 'record_time',
        kind: 'running',
        target_distance_km: 0.1,
        target_duration_sec: 5,
      }),
      today,
    ),
    null,
  );
});
