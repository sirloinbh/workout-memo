# #109 PWA install support: new-version notice, offline save message, install check

- Issue: [#109](https://github.com/sirloinbh/workout-memo/issues/109)
- Branch: `feat/109-pwa-install`

## Decisions (user, 2026-11-10, recorded in the issue)

- When a new service worker takes over a page that an older one controlled, show "A new version is available" with a Reload button. Do not reload automatically.
- Pages are not cached; offline shows `offline.html` as before. A failed save explains the lost connection and the kept draft instead of "Failed to fetch". The app shell cache waits for #106 and #107 (now #303).
- Keep the hand-written `sw.js` (centrally managed); no `vite-plugin-pwa`.
- Check one production build on localhost and record it here and in `docs/mobile-app.md`.
- `/api/` is never cached, so sign-in answers (#303) always come from the server.

## Changes

- `frontend/src/service-worker.ts` (new): registers `/sw.js` and calls the notice on `controllerchange` only when the page was already controlled at load (the first install also fires `controllerchange` because `sw.js` claims open pages). The notice is a sonner toast with no time limit, a fixed id so it does not stack, and a Reload button.
- `frontend/src/main.tsx`: uses `registerServiceWorker()` in production builds.
- `frontend/src/app.tsx`: `api()` turns a fetch that never got an answer into an `Unreachable` error: "Cannot reach the server. Check your connection." or "The server did not answer within 15 seconds." A failed workout save adds that the input is kept as a draft on this device only when the draft was really written to local storage.
- `frontend/index.html`: `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` ("Workout Log", the manifest `short_name`) and a black status bar. `theme-color` stays `#0a0a0a`.
- `docs/mobile-app.md`: service worker row and the localhost check results.
- Not changed: `sw.js`, `manifest.webmanifest`, `offline.html` and `nginx.conf` are centrally managed files.

## Tests

- `frontend/src/service-worker.test.tsx` (new, 4 tests)
  - A controlled page gets the notice once per takeover; `register('/sw.js')` is called.
  - The first install is not announced.
  - The notice does not reload by itself; its Reload button calls `location.reload()`.
  - `public/sw.js` run with stubs: GET, POST and navigation requests to `/api/` get no `respondWith` and touch no cache; a page navigation and an `/assets/` file are handled.
- `frontend/src/workout-draft.test.tsx`
  - New: an offline save shows "Cannot reach the server", the kept-draft note, no "Failed to fetch", and a reload offers Restore.
  - New: with local storage writes failing, the kept-draft note is not shown.
  - The deadline test now also checks "The server did not answer within 15 seconds".
- `npm run test -w frontend -- src/service-worker.test.tsx src/workout-draft.test.tsx`: 2 files, 28 tests passed.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- `npm run check` (full) was started but stopped before it finished when the session ended (2026-11-15); the rest of `npm test`, `test:skills`, `test:docs` and `build` still need a run. `npm run build -w frontend` passed on its own for the localhost check.

## Production build check on localhost (2026-11-15)

`npm run build -w frontend`, served from `http://localhost:5391` by a small Node static server with stubbed `/api/` answers, driven by Playwright with the installed Chrome and a persistent profile.

- `Page.getInstallabilityErrors`: no errors. `Page.getAppManifest`: no errors.
- Service worker: scope `/`, controls the page.
- Caches hold only `/offline.html` and `/assets/` files; no `/api/` entry.
- Offline navigation to `/journal` shows `offline.html`.
- After changing `VERSION` in the built `sw.js` and calling `registration.update()`, the notice "A new version is available" with Reload appeared at 390x844 and 1440x900 without a reload.

## Limits and follow-up

- Installing on a real phone and the production address need HTTPS (#106).
- `offline.html` itself cannot mention drafts here because it is centrally managed; the draft note is in the app's save failure message.
- The manifest `description` is a long internal sentence that an install dialog can show; raised as [project-standards#594](https://github.com/sirloinbh/project-standards/issues/594).
