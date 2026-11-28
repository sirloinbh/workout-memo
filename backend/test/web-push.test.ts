import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthMiddleware } from '@sirloinbh/auth-client';
import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { createPushService, pushConfigFromEnv, type PushPayload } from '../src/web-push.js';
import { listenApp } from './listen.js';

// #260: the subscription API and the one-off pushes (#485), without PostgreSQL or a push service.
// The rest-end schedule was removed (#528).
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
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
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
  const server = await listenApp(createApp(pool, { auth, push }));
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

test('without keys the config says so, and saving answers 503', async () => {
  const { pool, queries } = fakePool();
  await withApi(pool, createPushService(pool, { config: null }), async (call) => {
    assert.deepEqual((await call('/push/config')).body, { enabled: false, public_key: null });
    const saved = await call('/push/subscriptions', 'POST', subscription);
    assert.equal(saved.status, 503);
  });
  assert.equal(
    queries.some((q) => /INSERT/.test(q.sql)),
    false,
  );
});

// #528: the rest-end routes are gone.
test('the rest-end push routes no longer exist', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  await withApi(pool, push, async (call) => {
    assert.equal((await call('/push/rest', 'PUT', { ends_at: startedAt + 90_000 })).status, 404);
    assert.equal((await call('/push/rest', 'DELETE')).status, 404);
  });
  assert.deepEqual(queries, []);
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
      { ...subscription, endpoint: 'https://internal.example/' },
      { ...subscription, endpoint: 'https://fcm.googleapis.com.evil.example/x' },
      { ...subscription, endpoint: 'https://fcm.googleapis.com:8443/x' },
      { ...subscription, endpoint: 'https://user@fcm.googleapis.com/x' },
      { ...subscription, endpoint: 'https://notify.windows.com.evil.example/x' },
      { endpoint: subscription.endpoint, keys: { p256dh: '', auth: 'x' } },
      { ...subscription, extra: 1 },
    ]) {
      const response = await call('/push/subscriptions', 'POST', bad);
      assert.equal(response.status, 400, JSON.stringify(bad));
      assert.equal(typeof response.body.error, 'string');
    }
    for (const endpoint of [
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      assert.equal(
        (await call('/push/subscriptions', 'POST', { ...subscription, endpoint })).status,
        201,
      );
    }
    // #501: what PushSubscription.toJSON() really returns has expirationTime (null or a number).
    for (const expirationTime of [null, startedAt + 86_400_000]) {
      assert.equal(
        (await call('/push/subscriptions', 'POST', { ...subscription, expirationTime })).status,
        201,
      );
    }
    assert.equal(
      (await call('/push/subscriptions', 'POST', { ...subscription, expirationTime: 'soon' }))
        .status,
      400,
    );
    assert.equal(queries.filter((q) => /INSERT INTO push_subscriptions/.test(q.sql)).length, 6);
  });
});

test('deleting a subscription is limited to its owner', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  await withApi(pool, push, async (call) => {
    assert.equal((await call('/push/subscriptions', 'DELETE', {})).status, 400);
    assert.equal(
      (await call('/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint })).status,
      200,
    );
  });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [subscription.endpoint, 'u1']);
  assert.match(queries[0].sql, /DELETE FROM push_subscriptions WHERE endpoint=\$1 AND user_id=\$2/);
});

test('without sign-in (local development) there is one user', async () => {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, { config, send: async () => undefined });
  const server = await listenApp(createApp(pool, { push }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await fetch(`http://127.0.0.1:${address.port}/api/push/subscriptions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.deepEqual(queries[0].params, [subscription.endpoint, 'local']);
});

const row = { endpoint: subscription.endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' };
const payload: PushPayload = { title: 'Hello', body: 'Body', url: '/', tag: 't' };
// What a push reads: the user's subscriptions.
const subscriptionsOf = (subs: Record<string, unknown>[]) => (sql: string) =>
  /SELECT endpoint/.test(sql) ? subs : [];

test('a one-off push goes to every subscription of the user', async () => {
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const { pool, queries } = fakePool(
    subscriptionsOf([row, { ...row, endpoint: 'https://push.example/send/two' }]),
  );
  const push = createPushService(pool, {
    config,
    send: async (sub, p) => {
      sent.push({ endpoint: sub.endpoint, payload: p });
    },
  });
  await push.sendToUser('u1', payload);
  assert.deepEqual(
    sent.map((s) => s.endpoint),
    [subscription.endpoint, 'https://push.example/send/two'],
  );
  assert.deepEqual(sent[0].payload, payload);
  assert.deepEqual(queries[0].params, ['u1']);
});

test('a service without keys sends nothing', async () => {
  const { pool, queries } = fakePool(subscriptionsOf([row]));
  const off = createPushService(pool, { config: null });
  await off.sendToUser('u1', payload);
  assert.equal(off.enabled, false);
  assert.deepEqual(queries, []);
  await off.stop();
});

test('a subscription the push service has dropped (410) is removed; other failures are logged', async () => {
  const logged: string[] = [];
  const { pool, queries } = fakePool(
    subscriptionsOf([row, { ...row, endpoint: 'https://push.example/send/two' }]),
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
  await push.sendToUser('u1', payload);
  const removed = queries.filter((q) =>
    /DELETE FROM push_subscriptions WHERE endpoint=\$1$/.test(q.sql),
  );
  assert.deepEqual(
    removed.map((q) => q.params),
    [[row.endpoint]],
  );
  assert.deepEqual(logged, ['Push failed: push service down']);
});

// #371: a send that never answers is cut off by its deadline, so it cannot hold back other pushes.
test('a sender that never answers does not block the next push', async () => {
  const sent: string[] = [];
  const logged: string[] = [];
  const { pool } = fakePool((sql, params) =>
    /SELECT endpoint/.test(sql)
      ? [{ ...row, endpoint: `https://push.example/${String(params[0])}` }]
      : [],
  );
  const push = createPushService(pool, {
    config,
    sendTimeoutMs: 30,
    log: (message) => logged.push(message),
    send: (sub) => {
      if (sub.endpoint.endsWith('/stuck')) return new Promise<void>(() => undefined);
      sent.push(sub.endpoint);
      return Promise.resolve();
    },
  });
  await push.sendToUser('stuck', payload);
  await push.sendToUser('fine', payload);
  assert.deepEqual(sent, ['https://push.example/fine']);
  assert.match(logged.join('\n'), /timed out after 30 ms/);
});
