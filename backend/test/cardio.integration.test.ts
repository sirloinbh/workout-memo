import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

// #114: cardio sessions against PostgreSQL. Each run uses its own schema in the test DB (like
// backup.integration.test.ts) so the rows and the unique index never meet other test files.
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
  const schema = 'cardio114_' + randomUUID().replaceAll('-', '');
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

const run = {
  date: '2026-11-07',
  start_time: '07:30',
  kind: 'running',
  duration_sec: 1800,
  distance_km: 5,
  avg_heart_rate: 150,
  max_heart_rate: 171,
  calories_kcal: 380,
  elevation_gain_m: 35,
  avg_cadence: 168,
  effort: 'medium',
  memo: '아침 러닝',
};

test(
  'PostgreSQL cardio sessions: create, computed pace, list filters, get and delete',
  { skip: !url },
  async () => {
    await isolated(async (api) => {
      const created = await api('/cardio-sessions', 'POST', run);
      assert.equal(created.status, 201);
      const { id, created_at, updated_at, ...stored } = created.data;
      assert.ok(Number.isInteger(id) && id > 0);
      assert.equal(typeof created_at, 'string');
      assert.equal(typeof updated_at, 'string');
      assert.deepEqual(stored, {
        ...run,
        workout_id: null,
        source: 'manual',
        external_id: null,
        pace_sec_per_km: 360,
        speed_kmh: 10,
      });

      // No distance: pace and speed are null, never 0. Today itself is allowed.
      const ride = await api('/cardio-sessions', 'POST', {
        date: today,
        kind: 'indoor_cycling',
        duration_sec: 2700,
      });
      assert.equal(ride.status, 201);
      assert.equal(ride.data.distance_km, null);
      assert.equal(ride.data.pace_sec_per_km, null);
      assert.equal(ride.data.speed_kmh, null);
      assert.equal(ride.data.start_time, null);
      // 1 m precision survives NUMERIC(8,3).
      const swim = await api('/cardio-sessions', 'POST', {
        date: '2026-11-01',
        kind: 'swimming',
        duration_sec: 1500,
        distance_km: 1.025,
      });
      assert.equal(swim.data.distance_km, 1.025);

      // Rejected: a future date, zero or negative duration.
      for (const body of [
        { ...run, date: '2026-11-09' },
        { ...run, duration_sec: 0 },
        { ...run, duration_sec: -60 },
      ]) {
        const refused = await api('/cardio-sessions', 'POST', body);
        assert.equal(refused.status, 400, JSON.stringify(body));
        assert.equal(typeof refused.data.error, 'string');
      }

      const list = (path: string) =>
        api(path).then((r) => (r.data as unknown as Row[]).map((row) => row.kind));
      assert.deepEqual(await list('/cardio-sessions?from=2026-11-01&to=2026-11-08'), [
        'indoor_cycling',
        'running',
        'swimming',
      ]);
      assert.deepEqual(await list('/cardio-sessions?from=2026-11-07&to=2026-11-07'), ['running']);
      assert.deepEqual(await list('/cardio-sessions?from=2026-11-01&to=2026-11-08&kind=swimming'), [
        'swimming',
      ]);
      assert.deepEqual(
        await list('/cardio-sessions?from=2026-11-01&to=2026-11-08&kind=rowing'),
        [],
      );

      assert.equal((await api(`/cardio-sessions/${id}`)).data.memo, '아침 러닝');
      assert.deepEqual(await api(`/cardio-sessions/${id}`, 'DELETE'), {
        status: 200,
        data: { ok: true },
      });
      assert.deepEqual(await api(`/cardio-sessions/${id}`), {
        status: 404,
        data: { error: '유산소 기록을 찾을 수 없습니다' },
      });
      assert.equal((await api(`/cardio-sessions/${id}`, 'DELETE')).status, 404);
    });
  },
);

test(
  'PostgreSQL cardio sessions: one row per source and external id; manual rows never collide',
  { skip: !url },
  async () => {
    await isolated(async (api, pool) => {
      const imported = { ...run, source: 'garmin', external_id: 'act-1' };
      assert.equal((await api('/cardio-sessions', 'POST', imported)).status, 201);
      const duplicate = await api('/cardio-sessions', 'POST', { ...imported, memo: '다시' });
      assert.deepEqual(duplicate, {
        status: 409,
        data: { error: '같은 출처와 외부 ID의 유산소 기록이 이미 있습니다' },
      });
      // The same id from another source is another activity.
      assert.equal(
        (await api('/cardio-sessions', 'POST', { ...imported, source: 'nike' })).status,
        201,
      );
      // Identical manual sessions (no external id) are both kept.
      for (let i = 0; i < 2; i++)
        assert.equal((await api('/cardio-sessions', 'POST', run)).status, 201);
      assert.equal(
        (await api('/cardio-sessions', 'POST', { ...run, external_id: 'x' })).status,
        400,
        'manual rows have no external id',
      );
      const count = await pool.query('SELECT count(*)::int n FROM cardio_sessions');
      assert.equal(count.rows[0].n, 4);

      // The DB enforces the same rules for direct writes.
      for (const sql of [
        "INSERT INTO cardio_sessions(date,kind,duration_sec) VALUES('2026-11-01','running',0)",
        "INSERT INTO cardio_sessions(date,kind,duration_sec) VALUES('2026-11-01','skiing',60)",
        "INSERT INTO cardio_sessions(date,kind,duration_sec,external_id) VALUES('2026-11-01','running',60,'m-1')",
        "INSERT INTO cardio_sessions(date,kind,duration_sec,avg_heart_rate,max_heart_rate) VALUES('2026-11-01','running',60,160,150)",
        "INSERT INTO cardio_sessions(date,kind,duration_sec,distance_km) VALUES('2026-11-01','running',60,0)",
      ])
        await assert.rejects(pool.query(sql), (e: { code?: string }) => e.code === '23514', sql);
      await assert.rejects(
        pool.query(
          "INSERT INTO cardio_sessions(date,kind,duration_sec,source,external_id) VALUES('2026-11-01','running',60,'garmin','act-1')",
        ),
        (e: { code?: string }) => e.code === '23505',
      );
    });
  },
);

test(
  'PostgreSQL cardio sessions: update replaces every field in one transaction',
  { skip: !url },
  async () => {
    await isolated(async (api, pool) => {
      const first = await api('/cardio-sessions', 'POST', {
        ...run,
        source: 'garmin',
        external_id: 'a',
      });
      const second = await api('/cardio-sessions', 'POST', {
        ...run,
        source: 'garmin',
        external_id: 'b',
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);

      // Full replacement: omitted optional values become null, not the stored ones.
      const replaced = await api(`/cardio-sessions/${first.data.id}`, 'PUT', {
        date: '2026-11-06',
        kind: 'rowing',
        duration_sec: 900,
      });
      assert.equal(replaced.status, 200);
      assert.deepEqual(
        { ...replaced.data, created_at: 0, updated_at: 0 },
        {
          id: first.data.id,
          date: '2026-11-06',
          start_time: null,
          kind: 'rowing',
          duration_sec: 900,
          distance_km: null,
          avg_heart_rate: null,
          max_heart_rate: null,
          calories_kcal: null,
          elevation_gain_m: null,
          avg_cadence: null,
          effort: null,
          workout_id: null,
          source: 'manual',
          external_id: null,
          memo: '',
          created_at: 0,
          updated_at: 0,
          pace_sec_per_km: null,
          speed_kmh: null,
        },
      );
      assert.equal(replaced.data.created_at, first.data.created_at, 'created_at is kept');
      const stamps = await pool.query(
        'SELECT updated_at >= created_at AS ok FROM cardio_sessions WHERE id=$1',
        [first.data.id],
      );
      assert.equal(stamps.rows[0].ok, true);

      // Keeping its own external id is not a conflict.
      const same = await api(`/cardio-sessions/${second.data.id}`, 'PUT', {
        ...run,
        source: 'garmin',
        external_id: 'b',
        memo: '같은 외부 ID 유지',
      });
      assert.equal(same.status, 200);
      // Taking another row's external id is a 409; the rollback leaves the row unchanged.
      const clash = await api(`/cardio-sessions/${first.data.id}`, 'PUT', {
        ...run,
        source: 'garmin',
        external_id: 'b',
      });
      assert.equal(clash.status, 409);
      assert.equal((await api(`/cardio-sessions/${first.data.id}`)).data.kind, 'rowing');

      assert.deepEqual(await api('/cardio-sessions/999999', 'PUT', run), {
        status: 404,
        data: { error: '유산소 기록을 찾을 수 없습니다' },
      });
      assert.equal(
        (await api(`/cardio-sessions/${first.data.id}`, 'PUT', { ...run, date: '2026-11-09' }))
          .status,
        400,
      );
    });
  },
);

test(
  'PostgreSQL cardio sessions: a workout link must exist and deleting the workout only unlinks',
  { skip: !url },
  async () => {
    await isolated(async (api) => {
      const workout = await api('/workouts', 'POST', {
        date: '2026-11-07',
        title: '하체',
        notes: '',
        sets: [{ exercise: '스쿼트', machine_id: null, weight: 100, reps: 5, notes: '' }],
      });
      assert.equal(workout.status, 201);
      const linked = await api('/cardio-sessions', 'POST', { ...run, workout_id: workout.data.id });
      assert.equal(linked.status, 201);
      assert.equal(linked.data.workout_id, workout.data.id);
      assert.deepEqual(await api('/cardio-sessions', 'POST', { ...run, workout_id: 999999 }), {
        status: 400,
        data: { error: '연결할 근력 일지가 존재하지 않습니다' },
      });
      assert.equal(
        (await api(`/cardio-sessions/${linked.data.id}`, 'PUT', { ...run, workout_id: 999999 }))
          .status,
        400,
      );

      assert.equal((await api(`/workouts/${workout.data.id}`, 'DELETE')).status, 200);
      const after = await api(`/cardio-sessions/${linked.data.id}`);
      assert.equal(after.status, 200, 'The cardio session survives');
      assert.equal(after.data.workout_id, null);
      assert.equal(after.data.memo, '아침 러닝');
    });
  },
);

test(
  'PostgreSQL cardio records: longest per kind and 5/10 km bests only within ±2% of the distance',
  { skip: !url },
  async () => {
    await isolated(async (api) => {
      const records = async () => (await api('/cardio-sessions/records')).data;
      assert.deepEqual(await records(), { longest: [], best5k: null, best10k: null });
      const add = async (date: string, kind: string, distance_km: number | null, sec: number) => {
        const r = await api('/cardio-sessions', 'POST', {
          date,
          kind,
          duration_sec: sec,
          distance_km,
        });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        return r.data.id;
      };
      // Just outside the window (faster, so they would win if counted) and other kinds.
      await add('2026-10-01', 'running', 4.89, 1200);
      await add('2026-10-01', 'running', 5.11, 1100);
      await add('2026-10-01', 'running', 9.79, 2400);
      const longRun = await add('2026-10-01', 'running', 10.21, 2300);
      const walk = await add('2026-10-02', 'walking', 5, 1000);
      const swim = await add('2026-10-02', 'swimming', 1.5, 2400);
      await add('2026-10-02', 'indoor_cycling', null, 3600);
      const record = (id: number, date: string, distance_km: number, duration_sec: number) => ({
        id,
        date,
        distance_km,
        duration_sec,
      });
      // A kind without any distance has no longest record; the order follows the kind list.
      assert.deepEqual(await records(), {
        longest: [
          { kind: 'running', ...record(longRun, '2026-10-01', 10.21, 2300) },
          { kind: 'walking', ...record(walk, '2026-10-02', 5, 1000) },
          { kind: 'swimming', ...record(swim, '2026-10-02', 1.5, 2400) },
        ],
        best5k: null,
        best10k: null,
      });

      // Both bounds count: 4.9 and 9.8 first, then the faster 5.1 and 10.2.
      const low5 = await add('2026-10-03', 'running', 4.9, 1500);
      const low10 = await add('2026-10-03', 'running', 9.8, 3000);
      let r = await records();
      assert.deepEqual(r.best5k, record(low5, '2026-10-03', 4.9, 1500));
      assert.deepEqual(r.best10k, record(low10, '2026-10-03', 9.8, 3000));
      const high5 = await add('2026-10-04', 'running', 5.1, 1450);
      const high10 = await add('2026-10-04', 'running', 10.2, 2900);
      // The same time on a later day does not replace the earlier record.
      await add('2026-10-05', 'running', 5, 1450);
      r = await records();
      assert.deepEqual(r.best5k, record(high5, '2026-10-04', 5.1, 1450));
      assert.deepEqual(r.best10k, record(high10, '2026-10-04', 10.2, 2900));
    });
  },
);
