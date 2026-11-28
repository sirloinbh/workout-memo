import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createPushService } from '../src/web-push.js';

// #260: the push tables against PostgreSQL. Each run uses its own schema in the test DB, like the
// other integration tests. The rest-end schedule was removed (#528).
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
const payload = { title: 'Hello', body: 'Body', url: '/', tag: 't' };

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

test(
  'PostgreSQL push: subscriptions move to the new owner and one-off pushes reach them',
  { skip: !url },
  async () => {
    await isolated(async (pool) => {
      const sent: string[] = [];
      const push = createPushService(pool, {
        config,
        send: async (s) => void sent.push(s.endpoint),
      });
      await push.saveSubscription('u1', sub(1));
      await push.saveSubscription('u1', sub(2));
      await push.saveSubscription('u2', sub(3));
      // The same endpoint saved again moves to the new owner without a duplicate row.
      await push.saveSubscription('u1', sub(1));
      assert.equal((await pool.query('SELECT 1 FROM push_subscriptions')).rowCount, 3);
      await push.sendToUser('u1', payload);
      assert.deepEqual(sent.sort(), [sub(1).endpoint, sub(2).endpoint]);
    });
  },
);

// The migrations (including the drop in 025, #528) run in isolated(); the subscription table stays.
test(
  'PostgreSQL push: the subscription table stays for the weekly summary',
  { skip: !url },
  async () => {
    await isolated(async (pool) => {
      const found = await pool.query(`SELECT to_regclass('push_subscriptions') AS name`);
      assert.notEqual(found.rows[0].name, null);
    });
  },
);

test(
  'PostgreSQL push: only the owner removes a subscription, and a dead one is pruned',
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
      await push.sendToUser('u1', payload);
      assert.equal((await pool.query('SELECT 1 FROM push_subscriptions')).rowCount, 0);
    });
  },
);
