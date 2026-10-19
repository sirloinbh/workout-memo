import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

test(
  'PostgreSQL period endpoints, YYYY-MM-DD dates, edit relocation and deletion',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/workouts`;
    const ids: number[] = [];
    const body = (date: string) => ({
      date,
      title: 'Period integration fixture',
      notes: '',
      sets: [{ exercise: 'Period test squat', machine_id: null, weight: 100.25, reps: 10 }],
    });
    const adjacent = (date: string, offset: number) => {
      const value = new Date(date + 'T00:00:00Z');
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const request = async (path: string, method = 'GET', value?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: value ? JSON.stringify(value) : undefined,
      });
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      return response.json();
    };
    try {
      // Static expected ranges independently cover day, Monday/Sunday week,
      // leap month, year end, and inclusive trailing 28/84 days.
      for (const [from, to] of [
        ['2040-02-29', '2040-02-29'],
        ['2040-12-31', '2041-01-06'],
        ['2040-02-01', '2040-02-29'],
        ['2040-12-01', '2040-12-31'],
        ['2040-02-03', '2040-03-01'],
        ['2040-10-15', '2041-01-06'],
      ]) {
        const caseIds: number[] = [];
        for (const date of [adjacent(from, -1), from, to, adjacent(to, 1)]) {
          const created = await request('', 'POST', body(date));
          assert.equal(typeof created.id, 'number');
          ids.push(created.id);
          caseIds.push(created.id);
        }
        const list = await request(`?from=${from}&to=${to}`);
        const own = list.filter((w: { id: number }) => caseIds.includes(w.id));
        assert.deepEqual(
          own.map((w: { id: number }) => w.id),
          [caseIds[2], caseIds[1]],
        );
        assert.deepEqual(
          own.map((w: { date: string }) => w.date),
          [to, from],
        );
        assert.equal(
          own.reduce(
            (sum: number, w: { sets: { weight: string | number; reps: number }[] }) =>
              sum + w.sets.reduce((n, s) => n + Number(s.weight) * s.reps, 0),
            0,
          ),
          2005,
        );
        // Moving a session just outside the selected range removes it on reload.
        await request(`/${caseIds[2]}`, 'PUT', {
          ...body(adjacent(to, 1)),
          version: own[0].version,
        });
        const moved = await request(`?from=${from}&to=${to}`);
        assert.deepEqual(
          moved
            .filter((w: { id: number }) => caseIds.includes(w.id))
            .map((w: { id: number }) => w.id),
          [caseIds[1]],
        );
        await request(`/${caseIds[1]}`, 'DELETE');
        const deleted = await request(`?from=${from}&to=${to}`);
        assert.equal(deleted.filter((w: { id: number }) => caseIds.includes(w.id)).length, 0);
      }
    } finally {
      // Never clear shared tables: remove only records created by this test.
      try {
        if (ids.length) await pool.query('DELETE FROM workouts WHERE id = ANY($1::int[])', [ids]);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await pool.end();
      }
    }
  },
);

test(
  'PostgreSQL CRUD, date range, rollback, goal achievement and cascade deletion',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('server');
    const base = `http://127.0.0.1:${address.port}/api`;
    const call = async (path: string, method = 'GET', body?: unknown) => {
      const r = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    const exercise = 'Integration-' + Date.now();
    let wid: number | undefined, gid: number | undefined, mid: number | undefined;
    try {
      const b = await call('/brands');
      const m = await call('/machines', 'POST', {
        brand_id: b.data[0].id,
        name: exercise,
        base_weight: 20,
      });
      assert.equal(m.status, 201);
      mid = m.data.id;
      const body = {
        date: '2026-10-14',
        title: exercise,
        sets: [{ exercise, machine_id: mid, weight: 100, reps: 10 }],
      };
      const w = await call('/workouts', 'POST', body);
      assert.equal(w.status, 201);
      wid = w.data.id;
      const g = await call('/goals', 'POST', {
        exercise,
        target_weight: 110,
        target_reps: 10,
        start_date: '2020-01-01',
        deadline: '2099-12-31',
      });
      gid = g.data.id;
      assert.equal(
        (await call('/goals')).data.find((x: { id: number }) => x.id === gid).achieved,
        false,
      );
      assert.equal(
        (
          await call(`/workouts/${wid}`, 'PUT', {
            ...body,
            version: 1,
            sets: [{ exercise, machine_id: mid, weight: 110, reps: 10 }],
          })
        ).status,
        200,
      );
      assert.equal(
        (await call('/goals')).data.find((x: { id: number }) => x.id === gid).achieved,
        true,
      );
      assert.equal(
        (
          await call(`/workouts/${wid}`, 'PUT', {
            ...body,
            version: 2,
            sets: [{ exercise, machine_id: 2147483647, weight: 200, reps: 10 }],
          })
        ).status,
        400,
      );
      const list = await call('/workouts?from=2026-10-14&to=2026-10-14');
      assert.equal(Number(list.data.find((x: { id: number }) => x.id === wid).sets[0].weight), 110);
      assert.equal(
        (await call('/workouts?from=2026-10-15&to=2026-10-15')).data.some(
          (x: { id: number }) => x.id === wid,
        ),
        false,
      );
      assert.equal((await call('/workouts', 'POST', { ...body, date: '2026-02-30' })).status, 400);
      await call(`/workouts/${wid}`, 'DELETE');
      assert.equal((await pool.query('SELECT * FROM sets WHERE workout_id=$1', [wid])).rowCount, 0);
      assert.equal(
        (await call('/goals')).data.find((x: { id: number }) => x.id === gid).achieved,
        false,
      );
    } finally {
      if (wid) await pool.query('DELETE FROM workouts WHERE id=$1', [wid]);
      if (gid) await pool.query('DELETE FROM goals WHERE id=$1', [gid]);
      if (mid) await pool.query('DELETE FROM machines WHERE id=$1', [mid]);
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await pool.end();
    }
  },
);
