import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { fieldErrors, goalSchema, workoutSchema } from '../src/contract.js';

// #64: the server and the screens share these schemas and their Korean messages.
const set = { exercise: '스쿼트', weight: 100, reps: 5 };

test('workout messages are Korean, field-specific and use the right particles', () => {
  const result = workoutSchema.safeParse({
    date: '2026-02-30',
    title: ' ',
    sets: [set, { exercise: '', weight: -1, reps: 1.5 }],
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    date: '올바른 날짜를 입력하세요',
    title: '일지 제목을 입력하세요',
    'sets.1.exercise': '운동명을 입력하세요',
    'sets.1.weight': '총중량은 0~99999 kg으로 입력하세요',
    'sets.1.reps': '반복 수는 1~1000의 정수로 입력하세요',
  });
  const empty = workoutSchema.safeParse({ date: '2026-10-20', title: '하체', sets: [] });
  assert.ok(!empty.success);
  assert.equal(fieldErrors(empty.error).sets, '세트를 1개 이상 입력하세요');
});

test('a goal ending before it starts is reported on the deadline field', () => {
  const result = goalSchema.safeParse({
    exercise: '벤치프레스',
    target_weight: 80,
    target_reps: 5,
    start_date: '2026-10-20',
    deadline: '2026-10-19',
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    deadline: '종료일은 시작일과 같거나 이후여야 합니다',
  });
});

test('the API rejects invalid input with the same Korean message', async () => {
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
      body: JSON.stringify({ date: '2026-10-20', title: '하체', sets: [{ ...set, reps: 0 }] }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: '반복 수는 1~1000의 정수로 입력하세요' });
  } finally {
    server.close();
  }
});
