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
    const result = await handler(request);
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
