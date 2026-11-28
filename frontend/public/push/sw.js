// Web Push worker (#260). Registered by the app at scope /push/ when the user turns on the weekly summary
// notification (frontend/src/push.ts). It is separate from /sw.js, which is centrally managed and has no
// push handling; this worker never touches fetch, so pages and /api/ are not affected.
// - push: shows the notification the server sent (the weekly summary, #485) with vibration.
// - notificationclick: opens the app, or focuses an open window.
/* global self, clients */ // Service worker globals for ESLint.
const FALLBACK = {
  title: 'Your week in review',
  body: '',
  url: '/',
  tag: 'weekly-summary',
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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      vibrate: [200, 100, 200],
      icon: '/icons/icon-192.png',
      data: { url: payload.url },
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
