import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { workoutSchema } from '../src/domain.js';

const set = { exercise: '레그 프레스', machine_id: null, weight: 120.25, reps: 10 };
const workout = { date: '2024-02-29', title: '하체', notes: '일지 메모', sets: [set] };

test('workout validation retains independent notes for each set', () => {
  const parsed = workoutSchema.parse({
    ...workout,
    sets: [
      { ...set, notes: '왼쪽 무릎 확인' },
      { ...set, notes: '자세 유지' },
    ],
  });
  assert.deepEqual(parsed.sets, [
    { ...set, notes: '왼쪽 무릎 확인' },
    { ...set, notes: '자세 유지' },
  ]);
});

test('workout validation accepts zero and fractional total load with optional machine', () => {
  for (const weight of [0, 0.25, 120.25]) {
    const parsed = workoutSchema.parse({ ...workout, sets: [{ ...set, weight }] });
    assert.equal(parsed.date, '2024-02-29');
    assert.equal(parsed.sets[0].weight, weight);
    assert.equal(parsed.sets[0].machine_id, null);
  }
});

test('API rejects invalid workouts on create and update before accessing storage', async (t) => {
  let storageCalls = 0;
  const unavailable = () => {
    storageCalls++;
    throw new Error('Invalid input must not reach storage');
  };
  const app = createApp({ query: unavailable, connect: unavailable } as unknown as Pool);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(
    () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  );
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/workouts`;
  const invalid: [string, unknown][] = [
    ['missing date', { ...workout, date: undefined }],
    ['impossible date', { ...workout, date: '2026-02-29' }],
    ['timestamp instead of date', { ...workout, date: '2024-02-29T00:00:00Z' }],
    ['non padded date', { ...workout, date: '2024-2-29' }],
    ['missing title', { ...workout, title: undefined }],
    ['blank title', { ...workout, title: '  ' }],
    ['no sets', { ...workout, sets: [] }],
    ['missing exercise', { ...workout, sets: [{ ...set, exercise: undefined }] }],
    ['blank exercise', { ...workout, sets: [{ ...set, exercise: '  ' }] }],
    ['missing weight', { ...workout, sets: [{ ...set, weight: undefined }] }],
    ['negative weight', { ...workout, sets: [{ ...set, weight: -0.25 }] }],
    ['text weight', { ...workout, sets: [{ ...set, weight: '120' }] }],
    ['missing reps', { ...workout, sets: [{ ...set, reps: undefined }] }],
    ['zero reps', { ...workout, sets: [{ ...set, reps: 0 }] }],
    ['negative reps', { ...workout, sets: [{ ...set, reps: -1 }] }],
    ['fractional reps', { ...workout, sets: [{ ...set, reps: 1.5 }] }],
    ['invalid machine', { ...workout, sets: [{ ...set, machine_id: -1 }] }],
  ];
  for (const method of ['POST', 'PUT']) {
    for (const [name, body] of invalid) {
      await t.test(`${method}: ${name}`, async () => {
        const response = await fetch(base + (method === 'PUT' ? '/1' : ''), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        assert.equal(typeof (await response.json()).error, 'string');
      });
    }
  }
  assert.equal(storageCalls, 0);
});
