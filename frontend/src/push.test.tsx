import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import pushWorkerSource from '../public/push/sw.js?raw';
import { App } from './app';
import { keyToBytes } from './push';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #260: Web Push. The worker is public/push/sw.js (its own scope, because public/sw.js is centrally
// managed); the only push the app sends now is the weekly summary (#485, #528).
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

test('a push shows the weekly summary with vibration and the app path to open', async () => {
  const worker = loadWorker();
  await worker.push({
    title: 'Your week in review',
    body: '3 workout days · 1,000 kg · 1 new record',
    url: '/',
    tag: 'weekly-summary',
  });
  expect(worker.showNotification).toHaveBeenCalledWith('Your week in review', {
    body: '3 workout days · 1,000 kg · 1 new record',
    tag: 'weekly-summary',
    renotify: true,
    vibrate: [200, 100, 200],
    icon: '/icons/icon-192.png',
    data: { url: '/' },
  });
});

test('a push without a readable payload, or with a foreign address, falls back to safe text', async () => {
  const worker = loadWorker();
  await worker.run('push', { data: null });
  expect(worker.showNotification).toHaveBeenLastCalledWith(
    'Your week in review',
    expect.objectContaining({ tag: 'weekly-summary', data: { url: '/' } }),
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
    expect.objectContaining({ data: { url: '/' } }),
  );
});

test('the notification is shown even while the app is visible, and the worker has no rest handling (#528)', async () => {
  const postMessage = vi.fn();
  const worker = loadWorker([
    { url: 'https://form.example/', visibilityState: 'visible', focus: vi.fn(), postMessage },
  ]);
  await worker.push({
    title: 'Your week in review',
    body: '3 workout days',
    url: '/',
    tag: 'weekly-summary',
  });
  expect(postMessage).not.toHaveBeenCalled();
  expect(worker.showNotification).toHaveBeenCalledWith(
    'Your week in review',
    expect.objectContaining({ tag: 'weekly-summary', data: { url: '/' } }),
  );
  expect(pushWorkerSource).not.toMatch(/rest/i);
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
  await open.run('notificationclick', { notification: { close, data: { url: '/' } } });
  expect(close).toHaveBeenCalled();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(open.openWindow).not.toHaveBeenCalled();

  const none = loadWorker([]);
  await none.run('notificationclick', {
    notification: { close: vi.fn(), data: { url: '/dashboard' } },
  });
  expect(none.openWindow).toHaveBeenCalledWith('/dashboard');
  await none.run('notificationclick', { notification: { close: vi.fn() } });
  expect(none.openWindow).toHaveBeenLastCalledWith('/');
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

// ---- the weekly summary switch on the Settings page subscribes this browser ----
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
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/push/config') return config;
    if (url.pathname === '/api/push/weekly-summary') return { enabled: method === 'PUT' };
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
async function openSettings(ui: ReturnType<typeof mount>) {
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await openPage('Settings', ui.user);
  return within(screen.getByRole('main'));
}
const toggleName = 'Send me a weekly summary on Sunday at 21:00';

test('Settings has no rest-over switch and, without server keys, no weekly summary switch', async () => {
  browser('default');
  const off = mount({ enabled: false, public_key: null });
  const dialog = await openSettings(off);
  expect(dialog.queryByLabelText(toggleName)).toBeNull();
  expect(dialog.queryByLabelText(/when rest ends/)).toBeNull();
  expect(off.calls()).toEqual([]);
});

test('turning on the weekly summary asks for permission, subscribes and saves the subscription', async () => {
  const b = browser('default');
  const ui = mount();
  const dialog = await openSettings(ui);
  const toggle = await dialog.findByLabelText(toggleName);
  expect(dialog.queryByLabelText(/when rest ends/)).toBeNull();
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

test('if the server cannot save the subscription, nothing is left half-enabled', async () => {
  const b = browser('default');
  fixClock();
  mockApi(({ method, url }) => {
    if (url.pathname === '/api/push/config') return { enabled: true, public_key: publicKey };
    if (url.pathname === '/api/push/weekly-summary') return { enabled: false };
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
