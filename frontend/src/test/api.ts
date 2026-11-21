import { act } from '@testing-library/react';
import { vi } from 'vitest';

// 00:30 on 2026-10-15 in Seoul is still 2026-10-14 on a UTC device clock.
export const deviceNow = '2026-10-14T15:30:00Z';

// Fixes only Date so React scheduling, fetch and user-event timers stay real.
export function fixClock(now = deviceNow) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) });
}

export type ApiRequest = {
  method: string;
  path: string;
  url: URL;
  body: unknown;
  headers: Record<string, string>;
};
// A handler returns a JSON body (status 200), a Response, or throws to simulate
// a network failure.
export type ApiHandler = (request: ApiRequest) => unknown | Response | Promise<unknown | Response>;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rejectOnAbort<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function mockApi(handler: ApiHandler) {
  const requests: ApiRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = typeof input === 'string' ? input : input.toString();
    const url = new URL(path, 'http://localhost');
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const request: ApiRequest = {
      method: (init.method ?? 'GET').toUpperCase(),
      path,
      url,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      headers,
    };
    requests.push(request);
    init.signal?.throwIfAborted();
    // Like a browser, a pending request rejects as soon as its signal aborts.
    const result = await rejectOnAbort(Promise.resolve(handler(request)), init.signal);
    init.signal?.throwIfAborted();
    return result instanceof Response ? result : json(result ?? []);
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Lets the renders caused by finished work settle, without waiting for a timer. With
 * `awaitRequests` it first waits for every request sent so far, so use it only when none is held.
 */
export async function flushRenders(
  api: { fetch: { mock: { results: { value: unknown }[] } } },
  awaitRequests = false,
) {
  if (awaitRequests) await Promise.allSettled(api.fetch.mock.results.map((r) => r.value));
  for (let i = 0; i < 5; i++) await act(() => Promise.resolve());
}
