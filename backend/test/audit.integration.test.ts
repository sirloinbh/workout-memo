import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

// project-standards#553: saving, editing and deleting a journal each write one audit_log row in the
// same transaction, with the request ID from the X-Request-Id header.
test(
  'workout create, update and delete write audit rows',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api/workouts';
    const title = 'Audit-' + randomUUID();
    const body = {
      date: '2040-03-01',
      title,
      notes: 'Audit check',
      sets: [{ exercise: 'Squat', machine_id: null, weight: 100, reps: 5, notes: '' }],
    };
    try {
      const created = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'audit-create-1' },
        body: JSON.stringify(body),
      });
      assert.equal(created.status, 201);
      assert.equal(created.headers.get('x-request-id'), 'audit-create-1');
      const { id, version } = (await created.json()) as { id: number; version: number };
      const updated = await fetch(base + '/' + id, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, title: title + '-2', version }),
      });
      assert.equal(updated.status, 200);
      const updateId = updated.headers.get('x-request-id');
      assert.ok(updateId);
      assert.equal((await fetch(base + '/' + id, { method: 'DELETE' })).status, 200);
      assert.equal((await fetch(base + '/' + id, { method: 'DELETE' })).status, 404);

      const rows = (
        await pool.query(
          "SELECT actor_type,action,result,before,after,request_id FROM audit_log WHERE entity='workout' AND entity_id=$1 ORDER BY id",
          [String(id)],
        )
      ).rows;
      assert.deepEqual(
        rows.map((r) => [r.actor_type, r.action, r.result]),
        [
          ['user', 'create', 'ok'],
          ['user', 'update', 'ok'],
          ['user', 'delete', 'ok'],
        ],
      );
      assert.equal(rows[0].before, null);
      assert.deepEqual(rows[0].after, { date: '2040-03-01', title, version: 1, sets: 1 });
      assert.equal(rows[0].request_id, 'audit-create-1');
      assert.deepEqual(rows[1].before, { date: '2040-03-01', title, version: 1 });
      assert.equal(rows[1].after.title, title + '-2');
      assert.equal(rows[1].request_id, updateId);
      assert.deepEqual(rows[2].before, { date: '2040-03-01', title: title + '-2', version: 2 });
      assert.equal(rows[2].after, null);
    } finally {
      server.close();
      await pool.end();
    }
  },
);
