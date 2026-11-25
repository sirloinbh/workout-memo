import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { workoutSchema } from '../src/domain.js';
import { insertWorkout } from '../src/store/workouts.js';

// #481: a superset group lives on the sets of one workout log.
const base = { date: '2026-11-25', title: 'Upper body' };
const set = (exercise: string, superset?: number | null) => ({
  exercise,
  weight: 40,
  reps: 10,
  ...(superset === undefined ? {} : { superset }),
});
const parse = (sets: unknown[]) => workoutSchema.safeParse({ ...base, sets });

test('a set without a group is not in a superset', () => {
  const parsed = workoutSchema.parse({ ...base, sets: [set('Bench press'), set('Row')] });
  assert.deepEqual(
    parsed.sets.map((s) => s.superset),
    [null, null],
  );
});

test('two or more exercises can share a group, with several sets each', () => {
  const ok = parse([
    set('Bench press', 1),
    set('Row', 1),
    set('Bench press', 1),
    set('Row', 1),
    set('Curl'),
  ]);
  assert.equal(ok.success, true);
  const three = parse([set('A', 2), set('B', 2), set('C', 2)]);
  assert.equal(three.success, true);
});

test('a group with one exercise is rejected, even with several sets', () => {
  for (const sets of [
    [set('Bench press', 1), set('Row')],
    [set('Bench press', 1), set('bench press ', 1)],
  ]) {
    const result = parse(sets);
    assert.equal(result.success, false);
    assert.match(
      result.error!.issues[0].message,
      /Superset 1 needs at least two different exercises/,
    );
    assert.deepEqual(result.error!.issues[0].path.slice(0, 3), ['sets', 0, 'superset']);
  }
});

test('the group number is a whole number from 1 to 20', () => {
  for (const superset of [0, -1, 21, 1.5, '1', true, Number.NaN])
    assert.equal(parse([set('A', superset as never), set('B', superset as never)]).success, false);
  assert.equal(parse([set('A', 20), set('B', 20)]).success, true);
});

test(
  'the group is stored and read back with the set, and the migration can be reapplied',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = await insertWorkout(
        client,
        workoutSchema.parse({
          ...base,
          sets: [set('Bench press', 1), set('Row', 1), set('Curl', null)],
        }),
      );
      const rows = (
        await client.query(
          'SELECT exercise, superset FROM sets WHERE workout_id=$1 ORDER BY position',
          [id],
        )
      ).rows;
      assert.deepEqual(rows, [
        { exercise: 'Bench press', superset: 1 },
        { exercise: 'Row', superset: 1 },
        { exercise: 'Curl', superset: null },
      ]);
      await client.query(
        readFileSync(
          new URL('../../database/migrations/023_set_superset.sql', import.meta.url),
          'utf8',
        ),
      );
      await client.query('SAVEPOINT bad');
      await assert.rejects(client.query('UPDATE sets SET superset=21 WHERE workout_id=$1', [id]), {
        code: '23514',
      });
      await client.query('ROLLBACK TO SAVEPOINT bad');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  },
);
