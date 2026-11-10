import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { exerciseNameLimit, listExerciseNames } from '../src/routes/exercise-names.js';

// #124: autocomplete candidates from journals, goals, routines and machines. The rows are
// written inside a transaction that is rolled back, so other test files never see them.
test(
  'exercise names group spellings, count uses once per record and sort recent then frequent',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = await pool.connect();
    const p = `N124-${randomUUID().slice(0, 8)}`;
    try {
      await db.query('BEGIN');
      // Far-future dates keep these names ahead of any other data in the shared database.
      const workout = async (date: string, exercises: string[]) => {
        const id = (
          await db.query(`INSERT INTO workouts(date, title) VALUES($1, 'x') RETURNING id`, [date])
        ).rows[0].id;
        for (const [position, exercise] of exercises.entries())
          await db.query(
            'INSERT INTO sets(workout_id, exercise, weight, reps, position) VALUES($1,$2,50,5,$3)',
            [id, exercise, position],
          );
      };
      // Three sets in one journal count as one use; the latest spelling is shown.
      await workout('2099-01-01', [`${p} squat`, `${p} squat`, `${p} squat`]);
      await workout('2099-01-03', [` ${p} Squat `, `${p} bench`]);
      await workout('2099-01-02', [`${p} bench`]);
      await db.query(
        `INSERT INTO goals(exercise, target_weight, target_reps, start_date, deadline)
         VALUES($1, 60, 5, '2099-01-04', '2099-02-01')`,
        [`${p} deadlift`],
      );
      const plan = { name: 'r', splits: [{ exercises: [{ exercise: `${p} row` }] }] };
      await db.query(`INSERT INTO routines(plan, created_at) VALUES($1, '2099-01-05T23:30:00Z')`, [
        plan,
      ]);
      const brand = (await db.query('SELECT id FROM brands ORDER BY id LIMIT 1')).rows[0].id;
      await db.query('INSERT INTO machines(brand_id, name) VALUES($1, $2)', [
        brand,
        `${p} press machine`,
      ]);

      const rows = await listExerciseNames(db);
      assert.ok(rows.length <= exerciseNameLimit);
      const mine = rows.filter((r) => r.name.startsWith(p));
      assert.deepEqual(
        mine.filter((r) => r.last_used !== null),
        [
          // 23:30 UTC on 01-05 is 01-06 in Seoul.
          { name: `${p} row`, uses: 1, last_used: '2099-01-06' },
          { name: `${p} deadlift`, uses: 1, last_used: '2099-01-04' },
          // Same latest day: the one used in more records comes first.
          { name: `${p} bench`, uses: 2, last_used: '2099-01-03' },
          { name: `${p} Squat`, uses: 2, last_used: '2099-01-03' },
        ],
      );
      // A machine name has no date and is listed after every dated name (when it fits).
      const machine = rows.find((r) => r.name === `${p} press machine`);
      if (machine) {
        assert.deepEqual(machine, { name: `${p} press machine`, uses: 0, last_used: null });
        assert.ok(rows.indexOf(machine) > rows.indexOf(mine[0]));
      }
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }

    // The route answers with the same list.
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/exercise-names`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as unknown[];
      assert.ok(Array.isArray(body) && body.length <= exerciseNameLimit);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  },
);
