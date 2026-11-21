# Keep the API process up when the database drops a connection (#361)

## Change

- `/api/health` is registered before the sign-in middleware (`backend/src/app.ts`), so it no longer relies on the auth package skipping that path.
- The push service's stop function (`start()` in `backend/src/web-push.ts`) now returns a promise that resolves after a send in progress; `server.ts` ends the pool only after it, so a claimed rest push is not lost on SIGTERM.
- Already covered by the managed `standard/db.ts` and only tested here: `createPool` adds the pool and per-client `error` listeners (the server already uses it), and `withTransaction` guards `ROLLBACK` and destroys a client whose rollback failed (all workout routes use it through `inTransaction`).

## Checks

- `backend/test/resilience.test.ts`: pool and client `error` events do not throw; a failing `ROLLBACK` keeps the original error and destroys the client; `/api/health` answers 200 with an auth middleware that rejects everything; the push stop function waits for a running send.
