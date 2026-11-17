# #260 Rest timer Web Push

## Change

- Migration `017_web_push.sql`: tables `push_subscriptions` (endpoint, user, keys) and `rest_pushes` (one pending rest end per user).
- API (`backend/src/routes/push.ts`, `docs/api.md`, `docs/openapi.json`): `GET /api/push/config`, `POST` and `DELETE /api/push/subscriptions`, `PUT` and `DELETE /api/push/rest`. Schemas are in `shared/contract.ts` (synced to backend and frontend).
- Sending (`backend/src/web-push.ts`, `web-push` 3.6.7): the server checks every 2 seconds, claims due rests by deleting their row (so each is sent once), pushes "Rest over" to every subscription of the user, removes subscriptions the push service answers 404 or 410 for, and drops a push that is more than 2 minutes late.
- Subscriptions belong to the signed-in user (`req.user.id`, #303); without sign-in there is one user, `local`.
- Keys come from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and optional `VAPID_SUBJECT` (`.env.example`, `compose.yaml`, `docs/deployment.md` 2-2). Without them push is off: `/api/push/config` says `enabled: false`, saving a subscription and scheduling answer 503, and the Settings toggle is hidden. Merging without keys changes nothing for users.
- Worker `frontend/public/push/sw.js` (scope `/push/`): `push` shows "Rest over" with vibration (or only tells the page when the app is visible), `notificationclick` focuses an open app window or opens `/journal`. It is a separate worker because `public/sw.js` is centrally managed and has no push handling; it does not handle `fetch`.
- App (`frontend/src/push.ts`, `app.tsx`): a switch in the rest settings turns notifications on per device (permission prompt, subscribe, save) or off. While on, start and resume send the end time, and pause, cancel and an ended rest clear it. Blocked permission disables the switch and explains how to allow it. A failed sync shows a warning; the on-screen timer is unchanged.
- `backend/src/types/web-push.d.ts`: a small local declaration, because `@types/web-push` is not installed.

## Reason

- A browser tab cannot time a rest exactly while the screen is off, so the alert is sent from the server at the end time (`docs/mobile-app.md`).

## Verification

Run locally (2026-11-17, one command at a time because the PC was low on memory):

- Passed: `format:check`, `lint`, `typecheck` (backend, frontend, e2e), `contract:check`, `test:skills` (4), `test:docs` (3).
- Passed: backend `web-push.test.ts` and `web-push.integration.test.ts` (on a throwaway PostgreSQL 17 container, not a personal DB), `api-contract`, `openapi` and `migrations` tests (24 tests in total); frontend `push.test.tsx` (15 tests).
- Not run locally because the system stopped each full run for low memory: the rest of the backend suite, the rest of the frontend suite, `npm run build`, the backend Docker image build and the e2e tests. These are left to CI (`verify`, `e2e`, `docker-build`).
- Not verifiable by tests: a real push service and a real phone (see Still open).

## Still open

- Putting real VAPID keys into the production `.env` (a production change for the owner).
- The real-device check (Android Chrome, installed app, screen off), together with #110.
- Ask the central repo to import this worker from `sw.js` so there is one worker (optional).
