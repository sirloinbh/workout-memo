# Save workout logs on the phone while offline and send them when back online (#476)

When the server cannot be reached (offline, timeout, 5xx proxy page), pressing save now puts the log in a queue in the phone's IndexedDB instead of leaving it only as an unsent draft. The queue is sent in order when the app opens, when the browser fires `online`, and right after a save is queued.

## Decisions

- User decision (2026-11-25, recorded on #476): last write wins. A queued edit that finds the log changed on another device is resent on the server's current version, and the screen says the server copy was replaced.
- No backend change: the server already accepts an `Idempotency-Key` on `POST`/`PUT /api/workouts` and replays the stored answer, so the key stored with each queued save is the client-generated id. `backend/test/workout-retry.test.ts` and `set-completion.test.ts` already show that the same key saved twice creates one log.

## Change

| File                                          | Content                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/offline/queue.ts`               | IndexedDB queue (`workout-memo-offline`), swappable store for tests. `enqueueSave` resolves false if the phone cannot store it                 |
| `frontend/src/offline/sync.ts`                | `flushQueue`: in order; offline stops the run; a rejected save keeps its error and is not retried; a 409 version conflict on a PUT is replaced |
| `frontend/src/offline/use-offline-sync.ts`    | Flushes on open, on `online`, and after a save is queued; exposes waiting / rejected entries and the notice                                    |
| `frontend/src/offline/sync-status.tsx`        | Shows what waits on the phone, what the server rejected (with Discard), and the "server copy was replaced" notice                              |
| `frontend/src/workspace/use-workout-draft.ts` | An unreachable save is queued (with its existing retry key) and the local draft is cleared; if queueing fails the old draft behaviour stays    |
| `frontend/src/app.tsx`                        | Wires the hook and the status                                                                                                                  |

## Limits

- The service worker still does not cache pages (`docs/mobile-app.md`), so the queue works while the app is open; reopening the app while offline shows `offline.html` and the queue is sent the next time the app opens online.

## Checks

See the PR for the results of `npm run check`.

- `npm run check`: passed (format, lint, contract, typecheck, unit and backend tests, skills, docs, build).
- `frontend/src/offline/sync.test.ts` (6 tests): in-order send, offline stops the run, same key on a resend, rejected save kept with its error, conflict replaced, conflict on a missing log stays rejected.
- `e2e/offline-save.spec.ts`: saves with the network off, goes back online, the log appears once. Ran locally with `workout-crud` and `workout-mobile-flow` (4 passed). Windows reserves ports 3110-3209 here, so the API port 3201 fails with EACCES; the run used a throwaway copy of the config with ports 3291/5391 (not committed).
- The sync status renders nothing when the queue is empty, so existing screens and visual baselines do not change. The banner is plain `Notice` / `AlertBanner` text, which wraps at 390 px.
