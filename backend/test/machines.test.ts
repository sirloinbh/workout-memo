import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { machineSchema, volume, workoutSchema } from '../src/domain.js';

const machine = { brand_id: 1, name: 'Arsenal test machine', notes: 'Verified test fixture' };
const invalidWeights: unknown[] = [-0.25, 100000, '', '20', 'unknown', false, {}, [], undefined];

test('machine base weight preserves unknown, confirmed zero and confirmed positive values', () => {
  for (const base_weight of [null, 0, 20.25, 99999]) {
    assert.equal(machineSchema.parse({ ...machine, base_weight }).base_weight, base_weight);
  }
});

test('machine validation rejects invalid base weights and invalid brand selections', () => {
  for (const base_weight of [...invalidWeights, NaN, Infinity, -Infinity]) {
    assert.equal(
      machineSchema.safeParse({ ...machine, base_weight }).success,
      false,
      `must reject base weight ${String(base_weight)}`,
    );
  }
  for (const brand_id of [null, 0, -1, 1.5, '1']) {
    assert.equal(
      machineSchema.safeParse({ ...machine, brand_id, base_weight: null }).success,
      false,
    );
  }
});

test('machine-linked and free exercise sets retain the entered total weight and volume', () => {
  const workout = workoutSchema.parse({
    date: '2026-10-14',
    title: 'Total load',
    sets: [
      { exercise: 'Machine press', machine_id: 1, weight: 100, reps: 10 },
      { exercise: 'Free exercise', machine_id: null, weight: 20, reps: 5 },
    ],
  });
  assert.deepEqual(
    workout.sets.map(({ machine_id, weight }) => ({ machine_id, weight })),
    [
      { machine_id: 1, weight: 100 },
      { machine_id: null, weight: 20 },
    ],
  );
  assert.equal(volume(workout.sets), 1100);
});

test('machine create and update reject invalid input before touching storage', async () => {
  let storageCalls = 0;
  const pool = {
    query() {
      storageCalls++;
      throw Error('Invalid input must never reach storage');
    },
  } as unknown as Pool;
  const server = createApp(pool).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');
    for (const method of ['POST', 'PUT']) {
      for (const base_weight of invalidWeights) {
        const response: Response = await fetch(
          `http://127.0.0.1:${address.port}/api/machines${method === 'PUT' ? '/1' : ''}`,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...machine, base_weight }),
          },
        );
        assert.equal(response.status, 400, `${method}: ${String(base_weight)}`);
        assert.equal(typeof (await response.json()).error, 'string');
      }
      const response: Response = await fetch(
        `http://127.0.0.1:${address.port}/api/machines${method === 'PUT' ? '/1' : ''}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...machine, brand_id: 0, base_weight: null }),
        },
      );
      assert.equal(response.status, 400);
      await response.json();
    }
    assert.equal(storageCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
