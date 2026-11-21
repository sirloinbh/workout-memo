import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import type { Pool, PoolClient } from 'pg';

import { createApp } from '../src/app.js';
import { createPool } from '../src/standard/db.js';
import { inTransaction } from '../src/transaction.js';
import { createPushService } from '../src/web-push.js';

// #361: the API keeps serving when the database drops a connection, a failed ROLLBACK does not hide
// the real error, /api/health does not depend on the auth middleware, and shutdown waits for a push.

test('an idle pool error and a client error are logged, not thrown', () => {
  const pool = new EventEmitter();
  const logged: string[] = [];
  createPool(pool as never, (message) => logged.push(message));
  const client = new EventEmitter();
  pool.emit('connect', client);
  assert.doesNotThrow(() => pool.emit('error', new Error('idle client lost')));
  assert.doesNotThrow(() => client.emit('error', new Error('connection reset')));
  assert.deepEqual(logged, ['Database connection failed']);
});

test('a failing ROLLBACK still reports the original error and destroys the client', async () => {
  const released: unknown[] = [];
  const client = {
    query: async (sql: string) => {
      if (sql === 'ROLLBACK') throw new Error('connection lost');
      return { rows: [] };
    },
    release: (destroy?: boolean) => released.push(destroy),
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await assert.rejects(
    inTransaction(pool, async () => {
      throw new Error('the real failure');
    }),
    /the real failure/,
  );
  assert.deepEqual(released, [true]);
  const healthy = {
    query: async () => ({ rows: [] }),
    release: (destroy = false) => released.push(destroy),
  } as unknown as PoolClient;
  await inTransaction({ connect: async () => healthy } as unknown as Pool, async () => 1);
  assert.deepEqual(released, [true, false], 'a clean client goes back to the pool');
});

test('/api/health answers 200 even when the auth middleware rejects everything', async () => {
  const auth = (_req: unknown, res: { status: (n: number) => { json: (b: object) => void } }) =>
    res.status(401).json({ error: 'unauthorized' });
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const server = createApp(pool, { auth: auth as never }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const base = `http://127.0.0.1:${address.port}/api`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/brands`)).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('the push stop function waits for a send in progress', async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('min(ends_at)')) return { rows: [{ at: Date.now() + 5 }] };
      if (sql.includes('RETURNING user_id')) return { rows: [{ user_id: 'u1' }] };
      if (sql.startsWith('SELECT'))
        return { rows: [{ endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }] };
      return { rows: [] };
    },
  };
  let finishSend: () => void = () => undefined;
  let started = false;
  let finished = false;
  const push = createPushService(pool as never, {
    config: { subject: 'mailto:a@example.com', publicKey: 'p', privateKey: 'q' },
    send: () => {
      started = true;
      return new Promise<void>((resolve) => {
        finishSend = () => {
          finished = true;
          resolve();
        };
      });
    },
  });
  const stop = push.start();
  while (!started) await new Promise((resolve) => setTimeout(resolve, 5));
  let stopped = false;
  const stopping = stop().then(() => (stopped = true));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(stopped, false, 'stop is still waiting for the send');
  finishSend();
  await stopping;
  assert.equal(finished, true);
});
