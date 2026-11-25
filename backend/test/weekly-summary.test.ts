import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthMiddleware } from '@sirloinbh/auth-client';
import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { createPushService } from '../src/web-push.js';
import { dueWeek, nextSendAt, summaryPayload } from '../src/weekly-summary.js';
import { listenApp } from './listen.js';

// #485: the schedule and the text are pure; the settings route runs against a fake pool.
const at = (iso: string) => Date.parse(iso);

test('the next send is Sunday 21:00 in Seoul', () => {
  // Wednesday 2026-11-25 in Seoul -> Sunday 11-29 21:00 KST = 12:00Z.
  assert.equal(nextSendAt(at('2026-11-25T03:00:00Z')), at('2026-11-29T12:00:00Z'));
  // Just before and exactly at 21:00 on Sunday: before sends today, at 21:00 waits a week.
  assert.equal(nextSendAt(at('2026-11-22T11:59:59Z')), at('2026-11-22T12:00:00Z'));
  assert.equal(nextSendAt(at('2026-11-22T12:00:00Z')), at('2026-11-29T12:00:00Z'));
  // Sunday 16:00Z is already Monday 01:00 in Seoul.
  assert.equal(nextSendAt(at('2026-11-22T16:00:00Z')), at('2026-11-29T12:00:00Z'));
  // A year boundary: Sunday 2027-01-03.
  assert.equal(nextSendAt(at('2026-12-30T00:00:00Z')), at('2027-01-03T12:00:00Z'));
});

test('a summary is due only between Sunday 21:00 and midnight in Seoul, for that week', () => {
  assert.equal(dueWeek(at('2026-11-22T12:00:00Z')), '2026-11-16');
  assert.equal(dueWeek(at('2026-11-22T14:59:59Z')), '2026-11-16');
  assert.equal(dueWeek(at('2026-11-22T11:59:59Z')), null);
  // Monday 00:00 in Seoul.
  assert.equal(dueWeek(at('2026-11-22T15:00:00Z')), null);
  assert.equal(dueWeek(at('2026-11-25T12:00:00Z')), null);
  // Across a month and a year: Sunday 2027-01-03 belongs to the week of Monday 2026-12-28.
  assert.equal(dueWeek(at('2027-01-03T12:00:00Z')), '2026-12-28');
});

test('the text lists days, volume, records and, when there are goals, their progress', () => {
  const base = {
    from: '2026-11-16',
    to: '2026-11-22',
    workouts: 3,
    days: 3,
    volume: 12345.6,
    records: 2,
    goals_achieved: 1,
    goals_total: 4,
  };
  assert.deepEqual(summaryPayload(base), {
    title: 'Your week in review',
    body: '3 workout days · 12,346 kg · 2 new records · goals 1/4 achieved',
    url: '/',
    tag: 'weekly-summary',
  });
  assert.equal(
    summaryPayload({ ...base, days: 1, records: 1, goals_total: 0 }).body,
    '1 workout day · 12,346 kg · 1 new record',
  );
});

const user = { id: 'u1', email: 'me@example.com', name: 'Me', image: null };
function fakePool() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: /SELECT enabled/.test(sql) ? [{ enabled: true }] : [] };
    },
  } as unknown as Pool;
  return { pool, queries };
}

async function withApi(
  pushEnabled: boolean,
  run: (
    call: (method: string, body?: unknown) => Promise<{ status: number; body: unknown }>,
    q: ReturnType<typeof fakePool>['queries'],
  ) => Promise<void>,
) {
  const { pool, queries } = fakePool();
  const push = createPushService(pool, {
    config: pushEnabled ? { publicKey: 'k', privateKey: 'p', subject: 'mailto:a@b.c' } : null,
    send: async () => undefined,
  });
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
    await run(async (method, body) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/push/weekly-summary`, {
        method,
        headers: { 'Content-Type': 'application/json', cookie: 'sirloinbh.session_token=good' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, queries);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('the weekly summary switch is saved per user and validated', async () => {
  await withApi(true, async (call, queries) => {
    assert.deepEqual(await call('GET'), { status: 200, body: { enabled: true } });
    assert.deepEqual(await call('PUT', { enabled: true }), {
      status: 200,
      body: { enabled: true },
    });
    const insert = queries.find((q) => /INSERT INTO weekly_summary_settings/.test(q.sql));
    assert.deepEqual(insert?.params, ['u1', true]);
    assert.equal((await call('PUT', { enabled: 'yes' })).status, 400);
    assert.equal((await call('PUT', {})).status, 400);
  });
});

test('turning the summary on needs push on the server, turning it off does not', async () => {
  await withApi(false, async (call, queries) => {
    assert.equal((await call('PUT', { enabled: true })).status, 503);
    assert.equal(
      queries.some((q) => /INSERT/.test(q.sql)),
      false,
    );
    assert.deepEqual(await call('PUT', { enabled: false }), {
      status: 200,
      body: { enabled: false },
    });
  });
});
