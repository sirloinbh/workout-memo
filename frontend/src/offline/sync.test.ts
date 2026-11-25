import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { enqueueSave, listQueue, type QueuedSave, type QueueStore, useQueueStore } from './queue';
import { flushQueue } from './sync';

// #476: queued saves are sent in order, never duplicated, and a conflicting edit is replaced (last write wins).
function memoryStore(): QueueStore {
  const rows = new Map<string, QueuedSave>();
  return {
    all: () => Promise.resolve([...rows.values()].sort((a, b) => a.queuedAt - b.queuedAt)),
    put: (e) => Promise.resolve(void rows.set(e.key, e)),
    remove: (k) => Promise.resolve(void rows.delete(k)),
  };
}
const body = (extra: object = {}) =>
  JSON.stringify({
    date: '2026-11-20',
    title: 'Legs',
    notes: '',
    feedback: null,
    sets: [],
    ...extra,
  });
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

let calls: { url: string; method: string; key: string | null; body: string }[];
let handler: (url: string, method: string, key: string | null) => Response | Promise<Response>;
let previous: QueueStore;
beforeEach(() => {
  previous = useQueueStore(memoryStore());
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const key = new Headers(init.headers).get('Idempotency-Key');
    calls.push({ url, method: String(init.method), key, body: String(init.body ?? '') });
    return handler(url, String(init.method), key);
  });
});
afterEach(() => {
  useQueueStore(previous);
  vi.unstubAllGlobals();
});

test('queued saves are sent in order with their own keys, then removed', async () => {
  await enqueueSave({ key: 'k1', path: '/workouts', method: 'POST', body: body() }, 1);
  await enqueueSave(
    { key: 'k2', path: '/workouts', method: 'POST', body: body({ title: 'Pull' }) },
    2,
  );
  handler = () => json(201, { id: 1, version: 1 });
  const result = await flushQueue();
  expect(result).toEqual({ sent: 2, replaced: [], offline: false });
  expect(calls.map((c) => c.key)).toEqual(['k1', 'k2']);
  expect(await listQueue()).toEqual([]);
});

test('a lost connection stops the run and keeps every unsent save', async () => {
  await enqueueSave({ key: 'k1', path: '/workouts', method: 'POST', body: body() }, 1);
  await enqueueSave({ key: 'k2', path: '/workouts', method: 'POST', body: body() }, 2);
  handler = () => {
    throw new TypeError('Failed to fetch');
  };
  const result = await flushQueue();
  expect(result.offline).toBe(true);
  expect(calls).toHaveLength(1);
  expect((await listQueue()).map((q) => q.key)).toEqual(['k1', 'k2']);
});

test('a resend after an uncertain first try reuses the key the server already knows', async () => {
  await enqueueSave({ key: 'same-key', path: '/workouts', method: 'POST', body: body() }, 1);
  handler = () => json(201, { id: 7, version: 1 });
  await flushQueue();
  await enqueueSave({ key: 'same-key', path: '/workouts', method: 'POST', body: body() }, 2);
  await flushQueue();
  expect(calls.map((c) => c.key)).toEqual(['same-key', 'same-key']);
});

test('a rejected save stays with its error and later saves still go out', async () => {
  await enqueueSave({ key: 'bad', path: '/workouts', method: 'POST', body: body() }, 1);
  await enqueueSave({ key: 'good', path: '/workouts', method: 'POST', body: body() }, 2);
  handler = (_u, _m, key) =>
    key === 'bad' ? json(400, { error: 'Enter a title' }) : json(201, { id: 2, version: 1 });
  const result = await flushQueue();
  expect(result.sent).toBe(1);
  const left = await listQueue();
  expect(left).toHaveLength(1);
  expect(left[0]).toMatchObject({ key: 'bad', error: 'Enter a title' });
  // A rejected save is not sent again by the next run.
  calls = [];
  await flushQueue();
  expect(calls).toHaveLength(0);
});

test('a queued edit that conflicts is resent on the current version and reported as replaced', async () => {
  await enqueueSave(
    { key: 'old', path: '/workouts/5', method: 'PUT', body: body({ version: 2 }) },
    1,
  );
  handler = (url, method, key) => {
    if (method === 'GET') return json(200, [{ id: 5, version: 4 }]);
    if (key === 'old')
      return json(409, {
        error:
          'This record was edited on another device. Keep your draft and check the latest record.',
      });
    return json(200, { id: 5, version: 5 });
  };
  const result = await flushQueue();
  expect(result).toEqual({
    sent: 1,
    replaced: [{ title: 'Legs', date: '2026-11-20' }],
    offline: false,
  });
  const put = calls.filter((c) => c.method === 'PUT');
  expect(put).toHaveLength(2);
  expect(JSON.parse(put[1].body).version).toBe(4);
  expect(put[1].key).not.toBe('old');
  expect(await listQueue()).toEqual([]);
});

test('a conflicting edit of a log that no longer exists stays rejected', async () => {
  await enqueueSave(
    { key: 'old', path: '/workouts/5', method: 'PUT', body: body({ version: 2 }) },
    1,
  );
  handler = (_u, method) =>
    method === 'GET'
      ? json(200, [])
      : json(409, { error: 'This record was edited on another device. Keep your draft.' });
  const result = await flushQueue();
  expect(result.sent).toBe(0);
  expect((await listQueue())[0].error).toMatch(/deleted or moved/);
});
