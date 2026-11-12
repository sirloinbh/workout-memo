import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { workoutSchema } from '../src/domain.js';

test('set notes are optional for older clients and bounded like journal notes', () => {
  const workout = {
    date: '2026-10-15',
    title: 'Lower body',
    sets: [{ exercise: 'Squat', weight: 20, reps: 10 }],
  };
  assert.equal(workoutSchema.parse(workout).sets[0].notes, '');
  for (const notes of [null, 123, 'x'.repeat(4001)]) {
    assert.equal(
      workoutSchema.safeParse({ ...workout, sets: [{ ...workout.sets[0], notes }] }).success,
      false,
    );
  }
  assert.equal(
    workoutSchema.parse({ ...workout, sets: [{ ...workout.sets[0], notes: 'x'.repeat(4000) }] })
      .sets[0].notes.length,
    4000,
  );
});

test(
  'set notes migration preserves older rows and can be reapplied',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // A session-local table shadows public.sets; no existing test rows are altered.
      await client.query(
        'CREATE TEMP TABLE sets (id integer PRIMARY KEY, exercise text) ON COMMIT DROP',
      );
      await client.query("INSERT INTO sets VALUES (1, 'Squat')");
      const migration = readFileSync(
        new URL('../../database/migrations/002_set_notes.sql', import.meta.url),
        'utf8',
      );
      await client.query(migration);
      assert.deepEqual((await client.query('SELECT * FROM sets')).rows, [
        { id: 1, exercise: 'Squat', notes: '' },
      ]);
      await client.query("UPDATE sets SET notes='Saved memo' WHERE id=1");
      await client.query(migration);
      assert.deepEqual((await client.query('SELECT * FROM sets')).rows, [
        { id: 1, exercise: 'Squat', notes: 'Saved memo' },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);
