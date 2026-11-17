import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createPushService } from '../src/web-push.js';

// #260: the push tables and the due-rest claim against PostgreSQL. Each run uses its own schema in
// the test DB, like the other integration tests.
const url = process.env.TEST_DATABASE_URL;
const migrations = new URL('../../database/migrations/', import.meta.url);
const config = {
  publicKey: 'public-key',
  privateKey: 'private-key',
  subject: 'mailto:me@example.com',
};
const sub = (n: number) => ({
  endpoint: `https://push.example/send/${n}`,
  keys: { p256dh: 'p256dh', auth: 'auth' },
});

async function isolated(run: (pool: Pool) => Promise<void>) {
  const admin = new Pool({ connectionString: url });
  const schema = 'push260_' + randomUUID().replaceAll('-', '');
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

test('PostgreSQL rest push: schedule, replace, cancel and send once', { skip: !url }, async () => {
  await isolated(async (pool) => {
    const sent: string[] = [];
    const push = createPushService(pool, { config, send: async (s) => void sent.push(s.endpoint) });
    await push.saveSubscription('u1', sub(1));
    await push.saveSubscription('u1', sub(2));
    await push.saveSubscription('u2', sub(3));
    // The same endpoint saved again moves to the new owner without a duplicate row.
    await push.saveSubscription('u1', sub(1));
    assert.equal((await pool.query('SELECT 1 FROM push_subscriptions')).rowCount, 3);

    // Not due yet: nothing is sent and the schedule stays.
    await push.scheduleRest('u1', Date.now() + 60_000);
    assert.equal(await push.sendDue(), 0);
    assert.equal((await pool.query('SELECT 1 FROM rest_pushes')).rowCount, 1);

    // Replacing keeps one row per user; the earlier, cancelled time never fires.
    await push.scheduleRest('u1', Date.now() - 500);
    assert.equal((await pool.query('SELECT 1 FROM rest_pushes')).rowCount, 1);
    await push.scheduleRest('u2', Date.now() + 60_000);
    await push.cancelRest('u2');
    assert.equal((await pool.query('SELECT 1 FROM rest_pushes')).rowCount, 1);

    assert.equal(await push.sendDue(), 1);
    assert.deepEqual(sent.sort(), [sub(1).endpoint, sub(2).endpoint]);
    // Claimed once: a second check sends nothing.
    assert.equal(await push.sendDue(), 0);
    assert.equal(sent.length, 2);

    // A rest that ended long ago (server was down) is dropped, not sent late.
    await push.scheduleRest('u1', Date.now() - 10 * 60_000);
    assert.equal(await push.sendDue(), 0);
    assert.equal(sent.length, 2);
    assert.equal((await pool.query('SELECT 1 FROM rest_pushes')).rowCount, 0);
  });
});

test(
  'PostgreSQL rest push: only the owner removes a subscription, and a dead one is pruned',
  { skip: !url },
  async () => {
    await isolated(async (pool) => {
      const push = createPushService(pool, {
        config,
        send: async () => {
          throw Object.assign(new Error('gone'), { statusCode: 404 });
        },
      });
      await push.saveSubscription('u1', sub(1));
      await push.deleteSubscription('u2', sub(1).endpoint);
      assert.equal((await pool.query('SELECT 1 FROM push_subscriptions')).rowCount, 1);
      await push.scheduleRest('u1', Date.now() - 100);
      assert.equal(await push.sendDue(), 1);
      assert.equal((await pool.query('SELECT 1 FROM push_subscriptions')).rowCount, 0);

      // Removing the last subscription also drops the pending push.
      await push.saveSubscription('u1', sub(2));
      await push.scheduleRest('u1', Date.now() + 60_000);
      await push.deleteSubscription('u1', sub(2).endpoint);
      assert.equal((await pool.query('SELECT 1 FROM rest_pushes')).rowCount, 0);
    });
  },
);
