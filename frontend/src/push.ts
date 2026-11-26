import { requestJson } from './lib/api';
import type { RestTimer } from './rest-timer';

// #260: rest-end Web Push. The app tells the server when a rest ends and the server pushes then, so
// the alert arrives with the screen off. The worker is public/push/sw.js, at its own scope. The
// centrally managed public/sw.js also handles `push` and `notificationclick` since the standards
// sync (#486), but it only shows what an app subscribed to it; this app keeps subscribing through
// /push/sw.js, so a push is shown once and the two workers do not interfere (#499).
const pushWorkerUrl = '/push/sw.js';
const pushWorkerScope = '/push/';

export type PushStatus =
  | 'checking'
  | 'unsupported' // this browser has no Web Push (for example an iPhone tab that is not installed)
  | 'unavailable' // the server has no VAPID keys, so push is off
  | 'off'
  | 'on'
  | 'denied'; // the browser blocks notifications for this site

const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

type PushConfig = { enabled: boolean; public_key: string | null };

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(pushWorkerScope);
  return registration?.pushManager.getSubscription() ?? null;
}

// Where this browser stands: the permission is read first so a blocked site shows the guidance
// even before anything is asked.
export async function loadPushStatus(): Promise<{ status: PushStatus; publicKey: string | null }> {
  if (!pushSupported()) return { status: 'unsupported', publicKey: null };
  const config = await requestJson<PushConfig>('/api/push/config');
  if (!config.enabled || !config.public_key) return { status: 'unavailable', publicKey: null };
  if (Notification.permission === 'denied')
    return { status: 'denied', publicKey: config.public_key };
  const subscribed = Notification.permission === 'granted' && (await currentSubscription());
  return { status: subscribed ? 'on' : 'off', publicKey: config.public_key };
}

// The application server key is URL-safe base64 of the 65-byte public key.
export function keyToBytes(key: string) {
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

// subscribe() needs an active worker; a first registration is still installing.
async function activeWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker || worker.state === 'activated') return;
  await new Promise<void>((resolve, reject) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
      else if (worker.state === 'redundant')
        reject(new Error('The notification worker failed to start.'));
    });
  });
}

// Asks for the permission (a browser prompt, so call it from a tap), subscribes and saves the
// subscription for the signed-in user. A refused prompt is 'denied' or, if dismissed, 'off'.
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await navigator.serviceWorker.register(pushWorkerUrl, {
    scope: pushWorkerScope,
  });
  await activeWorker(registration);
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    }));
  try {
    await requestJson('/api/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
  } catch (error) {
    // Without the server's copy nothing would arrive, so do not leave a half-enabled subscription.
    await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
  return 'on';
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await requestJson('/api/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

// A running rest tells the server its end; cancel, pause, idle and an ended rest clear it. Resume
// sends the new end, because the server holds only the last time it was given.
// The calls go out one at a time in the order they were made (#370): a slow PUT must not land after the
// DELETE of a later pause or cancel, or the server would push for a rest that is no longer running.
let restQueue: Promise<unknown> = Promise.resolve();
export function syncRest(timer: RestTimer, now: number): Promise<void> {
  const send = async () => {
    if (timer.state === 'running' && timer.endsAt !== null && timer.endsAt > now)
      await requestJson('/api/push/rest', { method: 'PUT', body: { ends_at: timer.endsAt } });
    else await requestJson('/api/push/rest', { method: 'DELETE' });
  };
  const result = restQueue.then(send, send);
  restQueue = result.catch(() => undefined);
  return result;
}

export const permissionHelp =
  'Notifications are blocked for this site. Allow them in the browser or phone settings (site permissions), then reload this page.';
