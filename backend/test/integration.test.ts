import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
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
