import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

// #116: cardio goals against PostgreSQL. Each run uses its own schema in the test DB (like
// cardio.integration.test.ts) so the rows never meet other test files.
const url = process.env.TEST_DATABASE_URL;
const migrations = new URL('../../database/migrations/', import.meta.url);
// A fixed "today" so the not-after-today rule is deterministic.
const today = '2026-11-08';

type Row = Record<string, unknown> & { id: number; error?: string };
type Api = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<{ status: number; data: Row }>;

async function isolated(run: (api: Api, pool: Pool) => Promise<void>) {
  const admin = new Pool({ connectionString: url });
  const schema = 'cardiogoal116_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await pool.query(readFileSync(new URL(file, migrations), 'utf8'));
    // Listen only after the migrations and wait right away: 'listening' fires once, so a
    // listener attached after other awaits would never run and the test would hang.
    const listening = createApp(pool, { today: () => today }).listen(0, '127.0.0.1');
    server = listening;
    await new Promise<void>((resolve, reject) => {
      listening.once('listening', resolve);
      listening.once('error', reject);
    });
    const address = listening.address();
    assert.ok(address && typeof address !== 'string');
    const api: Api = async (path, method = 'GET', body) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()) as Row };
    };
    await run(api, pool);
  } finally {
    if (server) {
      const open = server;
      await new Promise<void>((resolve) => open.close(() => resolve()));
    }
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

const week = { start_date: '2026-11-02', deadline: '2026-11-15' };
const session = (date: string, distance_km: number | null, duration_sec = 1800) => ({
  date,
  kind: 'running',
  duration_sec,
  distance_km,
});

test(
  'PostgreSQL cardio goals: create, judge from stored sessions, list order and delete',
  { skip: !url },
  async () => {
    await isolated(async (api) => {
      // Today is Sunday 11-08: the week of 11-02 gets 6 + 4 km and a session without a distance.
      for (const s of [
        session('2026-11-03', 6),
        session('2026-11-07', 4),
        session('2026-11-08', null, 2400),
      ])
        assert.equal((await api('/cardio-sessions', 'POST', s)).status, 201);
      const distance = await api('/cardio-goals', 'POST', {
        goal_type: 'distance',
        period: 'week',
        target_distance_km: 10,
        ...week,
      });
      assert.equal(distance.status, 201);
      const { id, created_at, ...stored } = distance.data;
      assert.ok(Number.isInteger(id) && id > 0);
      assert.equal(typeof created_at, 'string');
      assert.deepEqual(stored, {
        goal_type: 'distance',
        kind: null,
        period: 'week',
        target_distance_km: 10,
        target_duration_sec: null,
        target_count: null,
        ...week,
      });
      const record = await api('/cardio-goals', 'POST', {
        goal_type: 'record_time',
        kind: 'running',
        target_distance_km: 5,
        target_duration_sec: 1800,
        start_date: '2026-11-01',
        deadline: '2026-11-30',
      });
      assert.equal(record.status, 201);

      const list = await api('/cardio-goals');
      assert.equal(list.status, 200);
      const goals = list.data as unknown as Row[];
      // Deadline first, like the strength goals.
      assert.deepEqual(
        goals.map((g) => g.goal_type),
        ['distance', 'record_time'],
      );
      // Exactly 10 km in the week holding today (Sunday 11-08); the session without a
      // distance does not count; the next week has nothing yet.
      assert.equal(goals[0].achieved, true);
      assert.deepEqual(goals[0].progress, {
        kind: 'period',
        current: { start: '2026-11-02', end: '2026-11-08', value: 10, achieved: true },
        periods: [
          { start: '2026-11-02', end: '2026-11-08', value: 10, achieved: true },
          { start: '2026-11-09', end: '2026-11-15', value: 0, achieved: false },
        ],
        periods_achieved: 1,
      });
      assert.equal(goals[1].achieved, true);
      assert.deepEqual(goals[1].progress, { kind: 'record', best: 1800 });

      // #251: the next goal from the stored targets, starting today (11-08) for the same length.
      const next = await api(`/cardio-goals/${id}/suggestion`);
      assert.equal(next.status, 200);
      assert.deepEqual(next.data, {
        goal_id: id,
        suggestion: {
          goal_type: 'distance',
          kind: null,
          period: 'week',
          target_distance_km: 11,
          target_duration_sec: null,
          target_count: null,
          start_date: '2026-11-08',
          deadline: '2026-11-21',
        },
      });
      assert.equal((await api('/cardio-goals/99999/suggestion')).status, 404);
      assert.equal((await api('/cardio-goals/abc/suggestion')).status, 400);

      assert.deepEqual((await api(`/cardio-goals/${id}`, 'DELETE')).data, { ok: true });
      const gone = await api(`/cardio-goals/${id}`, 'DELETE');
      assert.equal(gone.status, 404);
      assert.equal(gone.data.error, 'Cardio goal not found');
      assert.equal((await api('/cardio-goals/abc', 'DELETE')).status, 400);
      assert.equal(((await api('/cardio-goals')).data as unknown as Row[]).length, 1);
    });
  },
);

test(
  'PostgreSQL cardio goals: invalid shapes are 400 and the DB CHECK mirrors the API',
  { skip: !url },
  async () => {
    await isolated(async (api, pool) => {
      const bad = await api('/cardio-goals', 'POST', {
        goal_type: 'record_time',
        target_distance_km: 5,
        target_duration_sec: 1800,
        ...week,
      });
      assert.equal(bad.status, 400);
      // A direct write with a target of another goal type is rejected by the table too.
      await assert.rejects(
        pool.query(
          `INSERT INTO cardio_goals(goal_type, period, target_count, target_distance_km, start_date, deadline)
           VALUES ('count', 'week', 3, 5, '2026-11-02', '2026-11-15')`,
        ),
        /cardio_goals_shape/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO cardio_goals(goal_type, target_distance_km, start_date, deadline)
           VALUES ('longest_distance', 5, '2026-11-02', '2026-11-15')`,
        ),
        /cardio_goals_shape/,
      );
      // No goals: no session query, an empty list.
      assert.deepEqual((await api('/cardio-goals')).data, []);
    });
  },
);
