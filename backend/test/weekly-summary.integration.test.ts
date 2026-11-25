import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createPushService, type PushPayload } from '../src/web-push.js';
import { createWeeklySummary } from '../src/weekly-summary.js';

// #485: the weekly summary against PostgreSQL: content, the once-per-week guard and the no-workout skip.
const url = process.env.TEST_DATABASE_URL;
const migrations = new URL('../../database/migrations/', import.meta.url);
const config = { publicKey: 'k', privateKey: 'p', subject: 'mailto:me@example.com' };
const sub = (n: number) => ({
  endpoint: `https://push.example/send/${n}`,
  keys: { p256dh: 'p256dh', auth: 'auth' },
});
// Sunday 2026-11-22 21:00 in Seoul. The week is Monday 2026-11-16 to Sunday 2026-11-22.
const sunday21 = Date.parse('2026-11-22T12:00:00Z');

async function isolated(run: (pool: Pool) => Promise<void>) {
  const admin = new Pool({ connectionString: url });
  const schema = 'weekly485_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await pool.query(readFileSync(new URL(file, migrations), 'utf8'));
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

async function workout(pool: Pool, date: string, sets: [string, number, number, boolean?][]) {
  const id = (
    await pool.query(`INSERT INTO workouts(date, title) VALUES($1, 'x') RETURNING id`, [date])
  ).rows[0].id as number;
  for (const [i, [exercise, weight, reps, completed]] of sets.entries())
    await pool.query(
      'INSERT INTO sets(workout_id, exercise, weight, reps, position, completed) VALUES($1,$2,$3,$4,$5,$6)',
      [id, exercise, weight, reps, i, completed ?? true],
    );
}

function setup(pool: Pool, nowMs: { value: number }) {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const push = createPushService(pool, {
    config,
    send: async (s, payload) => void sent.push({ endpoint: s.endpoint, payload }),
  });
  const weekly = createWeeklySummary(pool, push, { now: () => nowMs.value });
  return { sent, push, weekly };
}

test(
  'the setting is off by default and the summary is sent once a week',
  { skip: !url },
  async () => {
    await isolated(async (pool) => {
      const clock = { value: sunday21 };
      const { sent, push, weekly } = setup(pool, clock);
      await push.saveSubscription('u1', sub(1));
      await push.saveSubscription('u2', sub(2));
      assert.equal(await weekly.isEnabled('u1'), false);
      // Last week's Sunday set is older than this week and is not counted.
      await workout(pool, '2026-11-15', [['Squat', 100, 5]]);
      await workout(pool, '2026-11-16', [['Squat', 100, 5]]);
      await workout(pool, '2026-11-20', [
        ['Squat', 110, 5],
        ['Bench', 60, 8, false],
      ]);
      await pool.query(
        `INSERT INTO goals(exercise, target_weight, target_reps, start_date, deadline)
       VALUES ('Squat', 105, 5, '2026-11-01', '2026-12-01'), ('Bench', 80, 5, '2026-11-01', '2026-12-01'),
              ('Deadlift', 100, 5, '2026-01-01', '2026-02-01')`,
      );

      // Nobody turned it on: nothing is sent.
      assert.equal(await weekly.sendDue(), 0);
      await weekly.setEnabled('u1', true);
      assert.equal(await weekly.isEnabled('u1'), true);
      await weekly.setEnabled('u2', false);

      assert.equal(await weekly.sendDue(), 1);
      assert.deepEqual(
        sent.map((s) => s.endpoint),
        [sub(1).endpoint],
      );
      // 2 workout days; volume 100*5 + 110*5 = 1,050 (the unfinished bench set is ignored); the 110 kg squat beats the
      // earlier bests, so 1 record; 1 of the 2 goals of the week is met.
      assert.equal(sent[0].payload.tag, 'weekly-summary');
      assert.equal(
        sent[0].payload.body,
        '2 workout days · 1,050 kg · 1 new record · goals 1/2 achieved',
      );

      // The same week again (a restart, or two checks at once) sends nothing.
      assert.equal(await weekly.sendDue(), 0);
      assert.equal(sent.length, 1);
      const [row] = (
        await pool.query(
          'SELECT last_sent_week::text w FROM weekly_summary_settings WHERE user_id=$1',
          ['u1'],
        )
      ).rows;
      assert.equal(row.w, '2026-11-16');

      // Not Sunday evening: nothing is due, even for a user who has not had the week.
      await weekly.setEnabled('u2', true);
      clock.value = Date.parse('2026-11-22T11:59:00Z');
      assert.equal(await weekly.sendDue(), 0);
      clock.value = Date.parse('2026-11-23T01:00:00Z');
      assert.equal(await weekly.sendDue(), 0);

      // The next Sunday: a week with no workouts sends nothing, and is marked so it is not retried.
      clock.value = Date.parse('2026-11-29T12:00:00Z');
      assert.equal(await weekly.sendDue(), 0);
      assert.equal(sent.length, 1);
      const marked = (
        await pool.query(
          'SELECT last_sent_week::text w FROM weekly_summary_settings ORDER BY user_id',
        )
      ).rows;
      assert.deepEqual(
        marked.map((r) => r.w),
        ['2026-11-23', '2026-11-23'],
      );
      await workout(pool, '2026-11-25', [['Squat', 50, 10]]);
      assert.equal(await weekly.sendDue(), 0);
      assert.equal(sent.length, 1);

      // The week after, with a workout, goes to both users.
      await workout(pool, '2026-12-02', [['Squat', 50, 10]]);
      clock.value = Date.parse('2026-12-06T12:00:00Z');
      assert.equal(await weekly.sendDue(), 2);
      assert.equal(sent.length, 3);
    });
  },
);

test('a failed claim race sends once when two checks overlap', { skip: !url }, async () => {
  await isolated(async (pool) => {
    const { sent, push, weekly } = setup(pool, { value: sunday21 });
    await push.saveSubscription('u1', sub(1));
    await weekly.setEnabled('u1', true);
    await workout(pool, '2026-11-18', [['Squat', 100, 5]]);
    const results = await Promise.all([weekly.sendDue(), weekly.sendDue()]);
    assert.deepEqual(results.sort(), [0, 1]);
    assert.equal(sent.length, 1);
  });
});
