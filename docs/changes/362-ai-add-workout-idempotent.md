# Make a retried add_workout AI call add one journal (#362)

## Change

- `add_workout` takes an optional `idempotency_key` (a UUID). The first call stores the key with a fingerprint of the content in `workout_requests`, the same table the REST route uses; a call that repeats the key and content answers with the stored `{ id, version }` and adds nothing.
- The same key with other content, or an expired key, is refused with an `error` in the result (the managed tool runner cannot return an HTTP 409), and nothing is added.
- The key check moved from the REST route into `findRetry` (`backend/src/routes/workouts.ts`), so both paths share one implementation. Calls without a key behave as before.
- A token's `jti` is not used as the key: it changes on every call, so a retry would never match.

## Checks

- `backend/test/ai-tools.integration.test.ts`: two calls with one key give one workout and the same id; the same key with a new title adds nothing; calls without a key add each time.
- The REST retry-key tests in `backend/test/integration.test.ts` still pass.
