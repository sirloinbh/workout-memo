import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { createApp } from '../src/app.js';
import { restoreRequest } from '../src/backup.js';
import {
  bodyMeasurementSchema,
  goalSchema,
  limitLength,
  machineSchema,
  routineSchema,
  weightStepSchema,
  workoutSchema,
} from '../src/domain.js';
import { jsonSchema } from '../src/openapi.js';

const workout = {
  date: '2026-01-05',
  title: '제목',
  sets: [{ exercise: '벤치', weight: 60, reps: 10 }],
};
const messages = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

test('a wrong type reports only the type, not the length rule as well', () => {
  assert.equal(messages(workoutSchema, { ...workout, title: [] }).length, 1);
  assert.equal(messages(workoutSchema, { ...workout, notes: Array(4001).fill(0) }).length, 1);
  assert.equal(messages(machineSchema, { brand_id: 1, name: [], base_weight: null }).length, 1);
});

test('the Korean text messages stay for missing, blank and too long values', () => {
  const { title: _title, ...untitled } = workout;
  assert.deepEqual(messages(workoutSchema, untitled), ['일지 제목을 입력하세요']);
  assert.deepEqual(messages(workoutSchema, { ...workout, title: '   ' }), [
    '일지 제목을 입력하세요',
  ]);
  assert.deepEqual(messages(workoutSchema, { ...workout, title: 'x'.repeat(121) }), [
    '일지 제목은 120자 이하로 입력하세요',
  ]);
  assert.deepEqual(messages(workoutSchema, { ...workout, notes: 'x'.repeat(4001) }), [
    '메모는 4000자 이하로 입력하세요',
  ]);
});

test('length checks count the trimmed value and limits stay readable for the API document', () => {
  const name = limitLength(z.string().trim(), { min: 1, max: 3 });
  assert.equal(name.parse('  abc  '), 'abc');
  assert.deepEqual(messages(name, 'abcd'), ['String must contain at most 3 character(s)']);
  assert.deepEqual(messages(name, ' '), ['String must contain at least 1 character(s)']);
  assert.deepEqual(jsonSchema(name), { type: 'string', minLength: 1, maxLength: 3 });
  assert.deepEqual(jsonSchema(limitLength(z.string(), { max: 3 }).default('')), {
    type: 'string',
    maxLength: 3,
    default: '',
  });
});

test('array limits still reject long arrays', () => {
  const sets = Array(201).fill(workout.sets[0]);
  assert.deepEqual(messages(workoutSchema, { ...workout, sets }), [
    '세트는 200개 이하로 입력하세요',
  ]);
  const rest = jsonSchema(routineSchema) as { properties: { rest_days: { maxItems: number } } };
  assert.equal(rest.properties.rest_days.maxItems, 6);
});

test('an infinite number (JSON 1e999) gets the message of the range it broke', () => {
  const set = (fields: object) => ({ ...workout, sets: [{ ...workout.sets[0], ...fields }] });
  assert.deepEqual(messages(workoutSchema, set({ weight: Infinity })), [
    '총중량은 0~99999 kg으로 입력하세요',
  ]);
  assert.deepEqual(messages(workoutSchema, set({ reps: -Infinity })), [
    '반복 수는 1~1000의 정수로 입력하세요',
  ]);
  assert.deepEqual(messages(weightStepSchema, { exercise: 'E', weight_step: Infinity }), [
    '증량 단위는 100 kg 이하로 입력하세요',
  ]);
  assert.deepEqual(messages(weightStepSchema, { exercise: 'E', weight_step: -Infinity }), [
    '증량 단위는 0보다 커야 합니다',
  ]);
  assert.deepEqual(
    messages(bodyMeasurementSchema, { date: '2026-01-05', body_weight_kg: Infinity }),
    ['체중은 유한한 숫자여야 합니다'],
  );
});

test('defaults fill only missing values and optional fields stay absent', () => {
  const parsed = workoutSchema.parse(workout);
  assert.equal(parsed.notes, '');
  assert.equal(parsed.feedback, null);
  assert.deepEqual(parsed.sets[0], {
    exercise: '벤치',
    machine_id: null,
    weight: 60,
    reps: 10,
    notes: '',
    completed: true,
    rpe: null,
  });
  assert.ok(!('version' in parsed));
  const machine = machineSchema.parse({ brand_id: 1, name: 'M', base_weight: null });
  assert.ok(!('single_joint' in machine), 'an update without the field keeps the stored value');
  assert.ok(!('official_weight_id' in machine), 'an update without the link keeps the stored link');
});

test('a restore request without a backup reaches the backup check', () => {
  assert.deepEqual(restoreRequest.parse({}), { mode: 'merge' });
});

test('a goal keeps its cross-field message on the deadline field', () => {
  const result = goalSchema.safeParse({
    exercise: 'E',
    target_weight: 1,
    target_reps: 1,
    start_date: '2026-02-01',
    deadline: '2026-01-01',
  });
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.issues.map((issue) => [issue.path, issue.message]),
    [[['deadline'], '종료일은 시작일과 같거나 이후여야 합니다']],
  );
});

test('the API answers 400, not 500, for bad bodies, constructor keys and retry keys', async (t) => {
  const forbidden = async () => {
    throw Error('Invalid input must not reach storage');
  };
  const pool = { query: forbidden, connect: forbidden } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const send = (path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    });
  for (const value of ['null', '1', '{}']) {
    const body = `{"constructor":${value}}`;
    for (const path of ['/api/workouts', '/api/machines', '/api/goals', '/api/routines']) {
      const response = await send(path, body);
      assert.equal(response.status, 400, `${path} ${body}`);
    }
    const nested = JSON.stringify({ ...workout, title: JSON.parse(body) });
    assert.equal((await send('/api/workouts', nested)).status, 400);
  }
  const response = await send('/api/workouts', JSON.stringify({ ...workout, title: [] }));
  assert.equal(response.status, 400);
  assert.equal(
    (await send('/api/workouts', JSON.stringify(workout), { 'Idempotency-Key': 'not-a-key' }))
      .status,
    400,
  );
  // Weight 1e999 parses to Infinity and must stay a validation error.
  const infinite = `{"date":"2026-01-05","title":"t","sets":[{"exercise":"e","weight":1e999,"reps":1}]}`;
  const answer = await send('/api/workouts', infinite);
  assert.equal(answer.status, 400);
  assert.equal((await answer.json()).error, '총중량은 0~99999 kg으로 입력하세요');
});
