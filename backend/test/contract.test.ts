import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { fieldErrors, goalSchema, machineSchema, workoutSchema } from '../src/contract.js';

// #64: the server and the screens share these schemas and their messages.
const set = { exercise: 'Squat', weight: 100, reps: 5 };

test('workout messages are field-specific and read as plain English', () => {
  const result = workoutSchema.safeParse({
    date: '2026-02-30',
    title: ' ',
    sets: [set, { exercise: '', weight: -1, reps: 1.5 }],
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    date: 'Enter a valid date',
    title: 'Enter a journal title',
    'sets.1.exercise': 'Enter an exercise name',
    'sets.1.weight': 'Enter a total weight from 0 to 99999 kg',
    'sets.1.reps': 'Enter reps as a whole number from 1 to 1000',
  });
  const empty = workoutSchema.safeParse({ date: '2026-10-20', title: 'Lower body', sets: [] });
  assert.ok(!empty.success);
  assert.equal(fieldErrors(empty.error).sets, 'Enter at least 1 set');
});

test('a goal ending before it starts is reported on the deadline field', () => {
  const result = goalSchema.safeParse({
    exercise: 'Benchpress',
    target_weight: 80,
    target_reps: 5,
    start_date: '2026-10-20',
    deadline: '2026-10-19',
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    deadline: 'The end date must be the same as or after the start date',
  });
});

test('the API rejects invalid input with the same message', async () => {
  const pool = {
    query: async () => {
      throw Error('Invalid input must not reach storage');
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/workouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-10-20',
        title: 'Lower body',
        sets: [{ ...set, reps: 0 }],
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Enter reps as a whole number from 1 to 1000',
    });
  } finally {
    server.close();
  }
});

test('ids beyond the integer column range and weights with extra decimals are rejected (#363)', () => {
  const set = { exercise: 'Squat', weight: 60, reps: 5 };
  const base = { date: '2026-10-20', title: 'Lower body', sets: [set] };
  assert.equal(workoutSchema.safeParse(base).success, true);
  assert.equal(
    workoutSchema.safeParse({ ...base, sets: [{ ...set, machine_id: 3000000000 }] }).success,
    false,
  );
  assert.equal(workoutSchema.safeParse({ ...base, version: 3000000000 }).success, false);
  assert.equal(
    workoutSchema.safeParse({ ...base, sets: [{ ...set, weight: 42.555 }] }).success,
    false,
  );
  assert.equal(
    workoutSchema.safeParse({ ...base, sets: [{ ...set, weight: 42.55 }] }).success,
    true,
  );
  assert.equal(
    machineSchema.safeParse({ brand_id: 3000000000, name: 'Press', base_weight: null }).success,
    false,
  );
  assert.equal(
    machineSchema.safeParse({ brand_id: 1, name: 'Press', base_weight: 1.234 }).success,
    false,
  );
  assert.equal(
    goalSchema.safeParse({
      exercise: 'Squat',
      target_weight: 100.123,
      target_reps: 5,
      start_date: '2026-10-01',
      deadline: '2026-10-31',
    }).success,
    false,
  );
});
