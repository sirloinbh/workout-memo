// Rest-timer Web Push worker (#260). Registered by the app at scope /push/ when the user turns on
// rest notifications (frontend/src/push.ts). It is separate from /sw.js, which is centrally managed
// and has no push handling; this worker never touches fetch, so pages and /api/ are not affected.
// - push: shows "Rest over" with vibration. If the app is open and visible, it only tells the page,
//   because the page already shows the end and vibrates itself.
// - notificationclick: opens the app, or focuses an open window.
/* global self, clients */ // Service worker globals for ESLint.
const FALLBACK = {
  title: 'Rest over',
  body: 'Time for your next set.',
  url: '/journal',
  tag: 'rest-timer',
};

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : {};
    return {
      title: typeof data.title === 'string' && data.title ? data.title : FALLBACK.title,
      body: typeof data.body === 'string' ? data.body : FALLBACK.body,
      // Only a path of this app is opened, never an address from the payload's origin.
      url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : FALLBACK.url,
      tag: typeof data.tag === 'string' && data.tag ? data.tag : FALLBACK.tag,
    };
  } catch {
    return FALLBACK;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const visible = windows.find((client) => client.visibilityState === 'visible');
      if (visible) {
        visible.postMessage({ type: 'rest-over' });
        return undefined;
      }
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        icon: '/icons/icon-192.png',
        data: { url: payload.url },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url ?? FALLBACK.url;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus();
      return clients.openWindow(path);
    }),
  );
});
