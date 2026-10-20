import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import * as domain from '../src/domain.js';
import { createApp } from '../src/app.js';
import { routineInput, type RoutineInput } from './routine-fixture.js';

type Schema = { safeParse(value: unknown): { success: boolean; data?: unknown } };
const schema = () => {
  const value = (domain as unknown as { routineSchema?: Schema }).routineSchema;
  assert.ok(value, 'Server must expose routineSchema alongside existing input schemas');
  return value;
};

test('routine validation accepts all five splits and preserves ordered duplicate body parts', () => {
  const validator = schema();
  for (const count of [1, 2, 3, 4, 5]) {
    for (const parts of [['가슴'], ['가슴', '등'], routineInput().splits[0].body_parts]) {
      const input = routineInput(count);
      input.splits[0].body_parts = parts;
      const parsed = validator.safeParse(input);
      assert.equal(parsed.success, true, `${count}-way split must be accepted`);
      assert.deepEqual(parsed.data, input, 'Manual goals, exercise baselines and repeats survive');
    }
  }
});

test('deload reduction metric and amount are explicit user choices; next week stays manual', () => {
  const validator = schema();
  const input = routineInput();
  for (const [index, metric, amount] of [
    [3, 'weight', 12.5],
    [7, 'sets', 1],
    [11, 'reps', 3],
  ] as const) {
    input.weeks[index] = { week: index + 1, kind: 'deload', amount, deload_metric: metric };
  }
  const result = validator.safeParse(input);
  assert.equal(result.success, true);
  assert.deepEqual(result.data, input, 'Week 5 must retain 7.25 kg rather than an automatic reset');
});

const invalid: [string, (input: RoutineInput) => unknown][] = [
  ['empty name', (p) => ({ ...p, name: ' ' })],
  ['unknown split', (p) => ({ ...p, split_count: 6 })],
  ['zero split', (p) => ({ ...p, split_count: 0 })],
  ['fractional split', (p) => ({ ...p, split_count: 2.5 })],
  ['string split', (p) => ({ ...p, split_count: '2' })],
  ['missing split group', (p) => ({ ...p, splits: p.splits.slice(1) })],
  [
    'unknown body part',
    (p) => {
      p.splits[0].body_parts.push('목');
      return p;
    },
  ],
  [
    'empty body parts',
    (p) => {
      p.splits[0].body_parts = [];
      return p;
    },
  ],
  ['impossible date', (p) => ({ ...p, start_date: '2024-02-30' })],
  ['non-calendar date', (p) => ({ ...p, start_date: '2024-2-29' })],
  ['missing start date', (p) => ({ ...p, start_date: undefined })],
  ['no weekly workouts', (p) => ({ ...p, weekly_workouts: 0 })],
  ['too many weekly workouts', (p) => ({ ...p, weekly_workouts: 8 })],
  ['fractional weekly workouts', (p) => ({ ...p, weekly_workouts: 2.5 })],
  ['rest frequency conflict', (p) => ({ ...p, weekly_workouts: 4 })],
  ['invalid rest day', (p) => ({ ...p, rest_days: [0, 2, 4, 7] })],
  ['duplicate rest day', (p) => ({ ...p, rest_days: [0, 2, 4, 4] })],
  ['missing week 12', (p) => ({ ...p, weeks: p.weeks.slice(0, 11) })],
  ['extra week 13', (p) => ({ ...p, weeks: [...p.weeks, { ...p.weeks[0], week: 13 }] })],
  [
    'week zero',
    (p) => {
      p.weeks[0].week = 0;
      return p;
    },
  ],
  [
    'week thirteen',
    (p) => {
      p.weeks[11].week = 13;
      return p;
    },
  ],
  [
    'fractional week',
    (p) => {
      p.weeks[0].week = 1.5;
      return p;
    },
  ],
  [
    'duplicate week and missing week',
    (p) => {
      p.weeks[1].week = 1;
      return p;
    },
  ],
  [
    'negative increase',
    (p) => {
      p.weeks[0].amount = -1;
      return p;
    },
  ],
  [
    'zero increase',
    (p) => {
      p.weeks[0].amount = 0;
      return p;
    },
  ],
  [
    'string increase',
    (p) => ({ ...p, weeks: [{ ...p.weeks[0], amount: '2.5' }, ...p.weeks.slice(1)] }),
  ],
  [
    'fractional repetition increase',
    (p) => {
      p.weeks[1].amount = 1.5;
      return p;
    },
  ],
  [
    'unknown goal kind',
    (p) => {
      p.weeks[0].kind = 'automatic';
      return p;
    },
  ],
  [
    'missing week 4 deload',
    (p) => {
      p.weeks[3] = { ...p.weeks[0], week: 4 };
      return p;
    },
  ],
  [
    'missing week 8 deload',
    (p) => {
      p.weeks[7] = { ...p.weeks[0], week: 8 };
      return p;
    },
  ],
  [
    'missing week 12 deload',
    (p) => {
      p.weeks[11] = { ...p.weeks[0], week: 12 };
      return p;
    },
  ],
  [
    'unexpected week 3 deload',
    (p) => {
      p.weeks[2] = { ...p.weeks[3], week: 3 };
      return p;
    },
  ],
  [
    'missing deload reduction metric',
    (p) => {
      p.weeks[3].deload_metric = null;
      return p;
    },
  ],
  [
    'unknown deload metric',
    (p) => {
      p.weeks[3].deload_metric = 'percentage';
      return p;
    },
  ],
  [
    'negative deload amount',
    (p) => {
      p.weeks[3].amount = -10;
      return p;
    },
  ],
  [
    'zero deload amount',
    (p) => {
      p.weeks[3].amount = 0;
      return p;
    },
  ],
  [
    'fractional set reduction',
    (p) => {
      p.weeks[3].deload_metric = 'sets';
      p.weeks[3].amount = 1.5;
      return p;
    },
  ],
  [
    'normal week with deload metric',
    (p) => {
      p.weeks[0].deload_metric = 'weight';
      return p;
    },
  ],
  [
    'no exercise',
    (p) => {
      p.splits[0].exercises = [];
      return p;
    },
  ],
  [
    'empty exercise name',
    (p) => {
      p.splits[0].exercises[0].exercise = ' ';
      return p;
    },
  ],
  [
    'negative baseline total kg',
    (p) => {
      p.splits[0].exercises[0].weight = -1;
      return p;
    },
  ],
  [
    'baseline kg exceeds existing limit',
    (p) => {
      p.splits[0].exercises[0].weight = 100000;
      return p;
    },
  ],
  [
    'zero baseline reps',
    (p) => {
      p.splits[0].exercises[0].reps = 0;
      return p;
    },
  ],
  [
    'fractional baseline reps',
    (p) => {
      p.splits[0].exercises[0].reps = 1.5;
      return p;
    },
  ],
  [
    'zero baseline sets',
    (p) => {
      p.splits[0].exercises[0].sets = 0;
      return p;
    },
  ],
  [
    'fractional baseline sets',
    (p) => {
      p.splits[0].exercises[0].sets = 1.5;
      return p;
    },
  ],
];

test('routine API rejects invalid selections, schedule and manual targets before storage', async (t) => {
  let queries = 0;
  const forbidden = async () => {
    queries++;
    throw Error('Invalid routine must not reach storage');
  };
  const pool = { query: forbidden, connect: forbidden } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const [name, mutate] of invalid) {
      await t.test(name, async () => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/routines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mutate(routineInput())),
        });
        assert.equal(response.status, 400, 'Invalid routine should return a validation error');
        assert.equal(typeof (await response.json()).error, 'string');
      });
    }
    assert.equal(queries, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('a split without body parts is rejected with a Korean message, not a raw validator string', () => {
  const input = routineInput(2);
  input.splits[1].body_parts = [];
  const result = domain.routineSchema.safeParse(input);
  assert.equal(result.success, false);
  const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
  assert.ok(messages.includes('분할마다 운동 부위를 1개 이상 선택하세요'), messages.join(' / '));
  assert.ok(!messages.some((m) => /Array must contain/.test(m)));
});
