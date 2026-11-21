# Start backend test servers on a port fetch accepts (#447)

## Change

- New `backend/test/listen.ts` with `listenApp(app)`: it starts the app with the managed `listenLocally` (`backend/test/standard/api.ts`), which listens again when the OS hands out a port on fetch's blocked list (6000, 10080 and others), and returns the listening server.
- All 51 `listen(0, ...)` calls in 40 test files use it, and the now useless waits for the `listening` event are gone. The only remaining `listen(0` is inside the managed `standard/api.ts`.

## Why

A plain `listen(0)` sometimes returned a blocked port and the next `fetch` failed with "bad port" at random (for example in `routine-cycle.test.ts`), and it passed on rerun.

## Checks

- `npm run check` passes; tests that need a database ran against a dedicated test DB.
