import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import pushWorkerSource from '../public/push/sw.js?raw';
import { App } from './app';
import { keyToBytes, syncRest } from './push';
import { defaultTimer, pauseTimer, resumeTimer, startTimer } from './rest-timer';
import { deferred, deviceNow, fixClock, flushRenders, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #260: rest-end Web Push. The worker is public/push/sw.js (its own scope, because public/sw.js
// is centrally managed); the toggle and the schedule calls are in the app.
type Listener = (event: unknown) => void;
type FakeWindow = {
  url: string;
  visibilityState: string;
  focus: () => unknown;
  postMessage: Listener;
};

function loadWorker(windows: FakeWindow[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve());
  const self = {
    location: { origin: 'https://form.example' },
    registration: { showNotification },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  const clients = { matchAll: vi.fn(() => Promise.resolve(windows)), openWindow };
  new Function('self', 'clients', pushWorkerSource)(self, clients);
  const run = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const push = (data: unknown) => run('push', { data: { json: () => data } });
  return { run, push, showNotification, openWindow, clients, self };
}

test('a push shows "Rest over" with vibration and the app path to open', async () => {
  const worker = loadWorker();
  await worker.push({
    title: 'Rest over',
    body: 'Time for your next set.',
    url: '/journal',
    tag: 'rest-timer',
  });
  expect(worker.showNotification).toHaveBeenCalledWith('Rest over', {
    body: 'Time for your next set.',
    tag: 'rest-timer',
    renotify: true,
    vibrate: [200, 100, 200],
    icon: '/icons/icon-192.png',
    data: { url: '/journal' },
  });
});

test('a push without a readable payload, or with a foreign address, falls back to safe text', async () => {
  const worker = loadWorker();
  await worker.run('push', { data: null });
  expect(worker.showNotification).toHaveBeenLastCalledWith(
    'Rest over',
    expect.objectContaining({ body: 'Time for your next set.', data: { url: '/journal' } }),
  );
  await worker.run('push', {
    data: {
      json: () => {
        throw new Error('not json');
      },
    },
  });
  expect(worker.showNotification).toHaveBeenCalledTimes(2);
  await worker.push({ title: 'Hi', url: 'https://evil.example/' });
  expect(worker.showNotification).toHaveBeenLastCalledWith(
    'Hi',
    expect.objectContaining({ data: { url: '/journal' } }),
  );
});

test('with the app open and visible the page is told instead of a second alert', async () => {
  const postMessage = vi.fn();
  const worker = loadWorker([
    {
      url: 'https://form.example/journal',
      visibilityState: 'visible',
      focus: vi.fn(),
      postMessage,
    },
  ]);
  await worker.push({ title: 'Rest over' });
  expect(postMessage).toHaveBeenCalledWith({ type: 'rest-over' });
  expect(worker.showNotification).not.toHaveBeenCalled();
});

test('the weekly summary is shown even while the app is visible (#485)', async () => {
  const postMessage = vi.fn();
  const worker = loadWorker([
    { url: 'https://form.example/', visibilityState: 'visible', focus: vi.fn(), postMessage },
  ]);
  await worker.push({
    title: 'Your week in review',
    body: '3 workout days · 1,000 kg · 1 new record',
    url: '/',
    tag: 'weekly-summary',
  });
  expect(postMessage).not.toHaveBeenCalled();
  expect(worker.showNotification).toHaveBeenCalledWith(
    'Your week in review',
    expect.objectContaining({ tag: 'weekly-summary', data: { url: '/' } }),
  );
});

test('a hidden app window still gets the notification', async () => {
  const worker = loadWorker([
    {
      url: 'https://form.example/',
      visibilityState: 'hidden',
      focus: vi.fn(),
      postMessage: vi.fn(),
    },
  ]);
  await worker.push({ title: 'Rest over' });
  expect(worker.showNotification).toHaveBeenCalledTimes(1);
});

test('tapping the notification focuses an open app window, or opens the app', async () => {
  const focus = vi.fn(() => Promise.resolve());
  const open = loadWorker([
    {
      url: 'https://other.example/',
      visibilityState: 'visible',
      focus: vi.fn(),
      postMessage: vi.fn(),
    },
    { url: 'https://form.example/goals', visibilityState: 'hidden', focus, postMessage: vi.fn() },
  ]);
  const close = vi.fn();
  await open.run('notificationclick', { notification: { close, data: { url: '/journal' } } });
  expect(close).toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(open.openWindow).not.toHaveBeenCalled();

  const none = loadWorker([]);
  await none.run('notificationclick', {
    notification: { close: vi.fn(), data: { url: '/journal' } },
  });
  expect(none.openWindow).toHaveBeenCalledWith('/journal');
  await none.run('notificationclick', { notification: { close: vi.fn() } });
  expect(none.openWindow).toHaveBeenLastCalledWith('/journal');
});

test('the worker takes over at once and does not handle fetch', async () => {
  const worker = loadWorker();
  await worker.run('install', {});
  await worker.run('activate', {});
  expect(worker.self.skipWaiting).toHaveBeenCalled();
  expect(worker.self.clients.claim).toHaveBeenCalled();
  expect(pushWorkerSource).not.toMatch(/addEventListener\('fetch'/);
});

test('the server key is decoded from URL-safe base64', () => {
  expect([...keyToBytes('AQID')]).toEqual([1, 2, 3]);
  expect([...keyToBytes('-_8')]).toEqual([251, 255]);
});

test('syncRest sends a running end, and clears it for pause, idle and an ended rest', async () => {
  const api = mockApi(() => ({ ok: true }));
  const now = Date.parse(deviceNow);
  const running = startTimer(defaultTimer(), now, 90);
  await syncRest(running, now);
  expect(api.requests.at(-1)).toMatchObject({
    method: 'PUT',
    path: '/api/push/rest',
    body: { ends_at: now + 90_000 },
  });
  await syncRest(pauseTimer(running, now + 30_000), now + 30_000);
  expect(api.requests.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/push/rest' });
  const resumed = resumeTimer(pauseTimer(running, now + 30_000), now + 40_000);
  await syncRest(resumed, now + 40_000);
  expect(api.requests.at(-1)).toMatchObject({ method: 'PUT', body: { ends_at: now + 100_000 } });
  await syncRest(defaultTimer(), now);
  expect(api.requests.at(-1)).toMatchObject({ method: 'DELETE' });
  await syncRest(running, now + 91_000);
  expect(api.requests.at(-1)).toMatchObject({ method: 'DELETE' });
});

// #370: a start followed at once by a pause must leave no scheduled push, even when the first request is slow.
test('syncRest sends calls in order: a slow PUT is finished before the later DELETE starts', async () => {
  const slowPut = deferred();
  let scheduled: number | null = null;
  const api = mockApi(async ({ method, body }) => {
    if (method === 'PUT') {
      await slowPut.promise;
      scheduled = (body as { ends_at: number }).ends_at;
    } else scheduled = null;
    return { ok: true };
  });
  const now = Date.parse(deviceNow);
  const running = startTimer(defaultTimer(), now, 90);
  const first = syncRest(running, now);
  const second = syncRest(pauseTimer(running, now + 1_000), now + 1_000);
  await flushRenders(api);
  expect(
    api.requests.map((r) => r.method),
    'the DELETE waits for the PUT',
  ).toEqual(['PUT']);
  slowPut.resolve();
  await Promise.all([first, second]);
  expect(api.requests.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
  expect(scheduled, 'the pause leaves no scheduled push').toBeNull();
});

test('syncRest keeps sending after a failed call', async () => {
  let calls = 0;
  const api = mockApi(({ method }) =>
    ++calls === 1 ? json({ error: 'down' }, 500) : { ok: method === 'DELETE' },
  );
  const now = Date.parse(deviceNow);
  const running = startTimer(defaultTimer(), now, 90);
  await expect(syncRest(running, now)).rejects.toThrow('down');
  await syncRest(defaultTimer(), now);
  expect(api.requests.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
});

// ---- the settings toggle and the schedule calls in the app ----
const publicKey = 'AQID';
// The shape PushSubscription.toJSON() returns in browsers, expirationTime included (#501).
const subscriptionJson = {
  endpoint: 'https://push.example/send/abc',
  expirationTime: null,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};

function browser(permission: NotificationPermission, subscribed = false, request = 'granted') {
  const subscription = {
    endpoint: subscriptionJson.endpoint,
    toJSON: () => subscriptionJson,
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  };
  let current: typeof subscription | null = subscribed ? subscription : null;
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn(() => Promise.resolve((current = subscription))),
  };
  const registration = {
    pushManager,
    installing: null,
    waiting: null,
    active: { state: 'activated' },
  };
  const serviceWorker = {
    register: vi.fn(() => Promise.resolve(registration)),
    getRegistration: vi.fn(() => Promise.resolve(subscribed ? registration : undefined)),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
  vi.stubGlobal('PushManager', class {});
  const requestPermission = vi.fn(() => Promise.resolve(request));
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { serviceWorker, pushManager, subscription, requestPermission };
}
afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function mount(
  config: { enabled: boolean; public_key: string | null } = {
    enabled: true,
    public_key: publicKey,
  },
) {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/push/config') return config;
    if (url.pathname.startsWith('/api/push/'))
      return method === 'POST' ? json({ ok: true }, 201) : { ok: true };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const calls = () =>
    api.requests.filter(
      (r) =>
        r.path.startsWith('/api/push/') &&
        r.path !== '/api/push/config' &&
        r.path !== '/api/push/weekly-summary',
    );
  return { user, calls, api };
}
// #508: the switch is on the Settings page; the rest buttons stay in the workout editor.
async function openSettings(ui: ReturnType<typeof mount>) {
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await openPage('Settings', ui.user);
  return within(screen.getByRole('main'));
}
async function openEditor(ui: ReturnType<typeof mount>) {
  await openPage('Day log', ui.user);
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  return within(screen.getByRole('dialog'));
}
const toggleName = 'Notify me when rest ends, even with the screen off';

test('without server keys, or in a browser without Web Push, there is no toggle and nothing is sent', async () => {
  browser('default');
  const off = mount({ enabled: false, public_key: null });
  const dialog = await openSettings(off);
  expect(dialog.queryByLabelText(toggleName)).toBeNull();
  const editor = await openEditor(off);
  await off.user.click(editor.getByRole('button', { name: 'Start rest' }));
  expect(off.calls()).toEqual([]);
});

test('turning it on asks for permission, subscribes and saves the subscription', async () => {
  const b = browser('default');
  const ui = mount();
  const dialog = await openSettings(ui);
  const toggle = await dialog.findByLabelText(toggleName);
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  await ui.user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  expect(b.requestPermission).toHaveBeenCalledTimes(1);
  expect(b.serviceWorker.register).toHaveBeenCalledWith('/push/sw.js', { scope: '/push/' });
  expect(b.pushManager.subscribe).toHaveBeenCalledWith({
    userVisibleOnly: true,
    applicationServerKey: new Uint8Array([1, 2, 3]),
  });
  expect(ui.calls().find((r) => r.method === 'POST')).toMatchObject({
    path: '/api/push/subscriptions',
    body: subscriptionJson,
  });
});

test('while on, start, pause, resume and cancel tell the server', async () => {
  browser('granted', true);
  const ui = mount();
  const dialog = await openSettings(ui);
  expect(await dialog.findByLabelText(toggleName)).toHaveAttribute('aria-checked', 'true');
  const sent = () =>
    ui
      .calls()
      .map((r) =>
        `${r.method} ${(r.body as { ends_at?: number } | undefined)?.ends_at ?? ''}`.trim(),
      );
  // Opening the app with an idle rest must not cancel a rest running on another device.
  expect(sent()).toEqual([]);
  const start = Date.parse(deviceNow);
  const editor = await openEditor(ui);
  await ui.user.click(editor.getByRole('button', { name: 'Start rest' }));
  await waitFor(() => expect(sent().at(-1)).toBe(`PUT ${start + 90_000}`));
  await ui.user.click(editor.getByRole('button', { name: 'Pause' }));
  await waitFor(() => expect(sent().at(-1)).toBe('DELETE'));
  await ui.user.click(editor.getByRole('button', { name: 'Resume' }));
  await waitFor(() => expect(sent().at(-1)).toBe(`PUT ${start + 90_000}`));
  await ui.user.click(editor.getByRole('button', { name: 'Cancel rest' }));
  await waitFor(() => expect(sent().at(-1)).toBe('DELETE'));
  expect(sent()).toEqual([`PUT ${start + 90_000}`, 'DELETE', `PUT ${start + 90_000}`, 'DELETE']);
});

test('turning it off removes the subscription on the server and in the browser', async () => {
  const b = browser('granted', true);
  const ui = mount();
  const dialog = await openSettings(ui);
  const toggle = await dialog.findByLabelText(toggleName);
  await ui.user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  expect(ui.calls().find((r) => r.path === '/api/push/subscriptions')).toMatchObject({
    method: 'DELETE',
    body: { endpoint: subscriptionJson.endpoint },
  });
  expect(b.subscription.unsubscribe).toHaveBeenCalled();
});

test('blocked notifications disable the toggle and explain how to allow them', async () => {
  const b = browser('denied');
  const ui = mount();
  const dialog = await openSettings(ui);
  const toggle = await dialog.findByLabelText(toggleName);
  expect(toggle).toBeDisabled();
  expect(dialog.getAllByText(/Notifications are blocked for this site/).length).toBeGreaterThan(0);
  expect(b.requestPermission).not.toHaveBeenCalled();
});

test('a refused permission prompt leaves it off and shows the blocked guidance after a block', async () => {
  const b = browser('default', false, 'denied');
  const ui = mount();
  const dialog = await openSettings(ui);
  const toggle = await dialog.findByLabelText(toggleName);
  await ui.user.click(toggle);
  await waitFor(() => expect(toggle).toBeDisabled());
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(dialog.getAllByText(/Notifications are blocked for this site/).length).toBeGreaterThan(0);
  expect(b.pushManager.subscribe).not.toHaveBeenCalled();
  expect(ui.calls()).toEqual([]);
});

test('if the server cannot save the subscription, nothing is left half-enabled', async () => {
  const b = browser('default');
  fixClock();
  mockApi(({ method, url }) => {
    if (url.pathname === '/api/push/config') return { enabled: true, public_key: publicKey };
    if (url.pathname === '/api/push/subscriptions' && method === 'POST')
      return json({ error: 'Push notifications are not set up on the server' }, 503);
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await openPage('Settings', user);
  const dialog = within(screen.getByRole('main'));
  const toggle = await dialog.findByLabelText(toggleName);
  await user.click(toggle);
  expect(
    await screen.findByText('Push notifications are not set up on the server'),
  ).toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(b.subscription.unsubscribe).toHaveBeenCalled();
});
