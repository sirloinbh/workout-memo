import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthMiddleware } from '@sirloinbh/auth-client';
import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import {
  createPushService,
  pushConfigFromEnv,
  type PushPayload,
  restOverPayload,
} from '../src/web-push.js';

// #260: the subscription API and the rest-end schedule, without PostgreSQL or a push service.
// A fake pool records the queries; web-push.integration.test.ts runs them on a real database.
type Query = { sql: string; params: unknown[] };
function fakePool(answer: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const queries: Query[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: answer(sql, params) };
    },
  } as unknown as Pool;
  return { pool, queries };
}
const config = {
  publicKey: 'public-key',
  privateKey: 'private-key',
  subject: 'mailto:me@example.com',
};
const subscription = {
  endpoint: 'https://push.example/send/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};
const user = { id: 'u1', email: 'me@example.com', name: 'Me', image: null };
const startedAt = Date.parse('2026-11-17T12:00:00Z');

async function withApi(
  pool: Pool,
  push: ReturnType<typeof createPushService>,
  run: (
    call: (
      path: string,
      method?: string,
      body?: unknown,
      cookie?: boolean,
    ) => Promise<{ status: number; body: Record<string, unknown> }>,
  ) => Promise<void>,
) {
  const auth = createAuthMiddleware({
    authUrl: 'http://shared-auth-api:3110',
    fetch: async (_url, init) => {
      const cookie = (init?.headers as Record<string, string> | undefined)?.cookie ?? '';
      return {
        ok: true,
        status: 200,
        json: async () => (cookie.includes('sirloinbh.session_token=good') ? { user } : null),
      };
    },
  });
  const server = createApp(pool, { auth, push, now: () => startedAt }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(async (path, method = 'GET', body, cookie = true) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { cookie: 'sirloinbh.session_token=good' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('keys are read only from the environment, and push is off without both', () => {
  assert.equal(pushConfigFromEnv({}), null);
  assert.equal(pushConfigFromEnv({ VAPID_PUBLIC_KEY: 'a' }), null);
  assert.equal(pushConfigFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: ' ' }), null);
  assert.deepEqual(pushConfigFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' }), {
    publicKey: 'a',
    privateKey: 'b',
    subject: 'https://workout-memo.daysofme.com',
  });
  assert.equal(
    pushConfigFromEnv({
      VAPID_PUBLIC_KEY: 'a',
      VAPID_PRIVATE_KEY: 'b',
      VAPID_SUBJECT: 'mailto:x@y.z',
    })?.subject,
    'mailto:x@y.z',
  );
});

test('without keys the config says so, and saving or scheduling answers 503', async () => {
  const { pool, queries } = fakePool();
  await withApi(pool, createPushService(pool, { config: null }), async (call) => {
    assert.deepEqual((await call('/push/config')).body, { enabled: false, public_key: null });
    const saved = await call('/push/subscriptions', 'POST', subscription);
    assert.equal(saved.status, 503);
    assert.equal((await call('/push/rest', 'PUT', { ends_at: startedAt + 90_000 })).status, 503);
    // Removing is always allowed, so a user can clean up after keys are removed.
    assert.equal((await call('/push/rest', 'DELETE')).status, 200);
  });
  assert.equal(
    queries.some((q) => /INSERT/.test(q.sql)),
    false,
  );
});

test('a subscription is saved for the signed-in user and validated', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  await withApi(pool, push, async (call) => {
    assert.deepEqual((await call('/push/config')).body, {
      enabled: true,
      public_key: 'public-key',
    });
    assert.equal((await call('/push/subscriptions', 'POST', subscription, false)).status, 401);
    const saved = await call('/push/subscriptions', 'POST', subscription);
    assert.equal(saved.status, 201);
    const insert = queries.find((q) => /INSERT INTO push_subscriptions/.test(q.sql));
    assert.deepEqual(insert?.params, [subscription.endpoint, 'u1', 'p256dh-key', 'auth-secret']);
    for (const bad of [
      {},
      { ...subscription, endpoint: 'http://push.example/x' },
      { ...subscription, endpoint: 'not a url' },
      { endpoint: subscription.endpoint, keys: { p256dh: '', auth: 'x' } },
      { ...subscription, extra: 1 },
    ]) {
      const response = await call('/push/subscriptions', 'POST', bad);
      assert.equal(response.status, 400, JSON.stringify(bad));
      assert.equal(typeof response.body.error, 'string');
    }
    assert.equal(queries.filter((q) => /INSERT INTO push_subscriptions/.test(q.sql)).length, 1);
  });
});

test('deleting a subscription is limited to its owner and drops an orphaned schedule', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  await withApi(pool, push, async (call) => {
    assert.equal((await call('/push/subscriptions', 'DELETE', {})).status, 400);
    assert.equal(
      (await call('/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint })).status,
      200,
    );
  });
  assert.deepEqual(queries[0].params, [subscription.endpoint, 'u1']);
  assert.match(queries[0].sql, /DELETE FROM push_subscriptions WHERE endpoint=\$1 AND user_id=\$2/);
  assert.match(queries[1].sql, /DELETE FROM rest_pushes WHERE user_id=\$1/);
});

test('the rest end is scheduled per user, replaced, bounded and cancelled', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  await withApi(pool, push, async (call) => {
    const end = startedAt + 90_000;
    assert.equal((await call('/push/rest', 'PUT', { ends_at: end })).status, 200);
    const upsert = queries.find((q) => /INSERT INTO rest_pushes/.test(q.sql));
    assert.match(upsert!.sql, /ON CONFLICT \(user_id\) DO UPDATE/);
    assert.deepEqual(upsert!.params, ['u1', end]);
    // A little in the past (slow device clock) is still sent at once; a long past end is refused.
    assert.equal((await call('/push/rest', 'PUT', { ends_at: startedAt - 5_000 })).status, 200);
    const past = await call('/push/rest', 'PUT', { ends_at: startedAt - 60_000 });
    assert.deepEqual(past, { status: 400, body: { error: 'The rest has already ended' } });
    const far = await call('/push/rest', 'PUT', { ends_at: startedAt + 3 * 3600_000 });
    assert.equal(far.status, 400);
    for (const bad of [{}, { ends_at: 'soon' }, { ends_at: 1.5 }, { ends_at: end, extra: 1 }])
      assert.equal((await call('/push/rest', 'PUT', bad)).status, 400, JSON.stringify(bad));
    assert.equal(queries.filter((q) => /INSERT INTO rest_pushes/.test(q.sql)).length, 2);
    assert.equal((await call('/push/rest', 'DELETE')).status, 200);
    const cancel = queries.filter((q) => /DELETE FROM rest_pushes/.test(q.sql)).at(-1);
    assert.deepEqual(cancel!.params, ['u1']);
  });
});

test('without sign-in (local development) there is one user', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  const server = createApp(pool, { push, now: () => startedAt }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await fetch(`http://127.0.0.1:${address.port}/api/push/rest`, { method: 'DELETE' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.deepEqual(queries[0].params, ['local']);
});

// What sendDue reads: the claimed rows, then the user's subscriptions.
function dueRows(rows: Record<string, unknown>[], subs: Record<string, unknown>[]) {
  return (sql: string) =>
    /DELETE FROM rest_pushes WHERE ends_at <= now\(\) RETURNING/.test(sql)
      ? rows
      : /SELECT endpoint/.test(sql)
        ? subs
        : [];
}
const row = { endpoint: subscription.endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' };

test('a due rest pushes "Rest over" to every subscription of the user once', async () => {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const { pool, queries } = fakePool(
    dueRows([{ user_id: 'u1' }], [row, { ...row, endpoint: 'https://push.example/send/two' }]),
  );
  const push = createPushService(pool, {
    config,
    send: async (sub, payload) => {
      sent.push({ endpoint: sub.endpoint, payload });
    },
  });
  assert.equal(await push.sendDue(), 1);
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    [subscription.endpoint, 'https://push.example/send/two'],
  );
  assert.deepEqual(sent[0].payload, restOverPayload);
  assert.equal(restOverPayload.title, 'Rest over');
  // Stale schedules are dropped before the claim, and the claim deletes the row it returns.
  assert.match(queries[0].sql, /ends_at < now\(\) - make_interval/);
  assert.match(
    queries[1].sql,
    /DELETE FROM rest_pushes WHERE ends_at <= now\(\) RETURNING user_id/,
  );
});

test('a rest that is not due, or a service without keys, sends nothing', async () => {
  const sent: string[] = [];
  const { pool } = fakePool(dueRows([], [row]));
  const push = createPushService(pool, { config, send: async (s) => void sent.push(s.endpoint) });
  assert.equal(await push.sendDue(), 0);
  assert.deepEqual(sent, []);
  const off = createPushService(fakePool(dueRows([{ user_id: 'u1' }], [row])).pool, {
    config: null,
  });
  assert.equal(await off.sendDue(), 0);
  assert.equal(off.enabled, false);
  assert.doesNotThrow(() => off.start()());
});

test('a subscription the push service has dropped (410) is removed; other failures are logged', async () => {
  const logged: string[] = [];
  const { pool, queries } = fakePool(
    dueRows([{ user_id: 'u1' }], [row, { ...row, endpoint: 'https://push.example/send/two' }]),
  );
  const push = createPushService(pool, {
    config,
    log: (message) => logged.push(message),
    send: async (sub) => {
      if (sub.endpoint === row.endpoint)
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      throw Object.assign(new Error('push service down'), { statusCode: 500 });
    },
  });
  assert.equal(await push.sendDue(), 1);
  const removed = queries.filter((q) =>
    /DELETE FROM push_subscriptions WHERE endpoint=\$1$/.test(q.sql),
  );
  assert.deepEqual(
    removed.map((q) => q.params),
    [[row.endpoint]],
  );
  assert.deepEqual(logged, ['Rest push failed: push service down']);
});
