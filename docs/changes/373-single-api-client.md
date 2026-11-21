# One API client for every screen (#373)

Seven private fetch wrappers answered differently on a proxy HTML 502: several called `response.json()` before checking `response.ok`, so the user saw "Unexpected token '<'".

## Change

| File                                                                         | Content                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`                                                       | `api()` is now a thin adapter over `requestJson` (15 s timeout, idempotency key header). It keeps the `Unreachable` class and the existing messages for timeout, network and non-JSON 5xx.              |
| `analysis.tsx`, `backup.tsx`, `body.tsx`, `cardio-goals.tsx`, `routines.tsx` | Their wrappers call `requestJson`; the two raw `fetch` calls in `routines.tsx` too.                                                                                                                     |
| `analysis.tsx`                                                               | A failed body-part save has its own banner (`saveError`); the load error (with "Reconnect") is no longer overwritten.                                                                                   |
| `cardio/api.ts`                                                              | The import keeps its own request, because the central client drops the per-row `rows` of a refusal. It now reads the body as text, has a 30 s timeout, and names the HTTP status for a non-JSON answer. |
| `api-html-errors.test.tsx`                                                   | Each screen and the import answered with an HTML 502.                                                                                                                                                   |

## Notes

- `lib/api.ts` already had the timeout and "Cannot reach the server" handling, so no central change was needed. Passing `rows` through it is a project-standards item; `lib/ai-chat.ts` (managed) still has its own `response.json()`.
- Not changed: `cardio-goals.tsx` still treats a failed reload after a save as a save failure (`save()` awaits `load()`); not in this scope.

## Checks

- `npm run test -w frontend` on the touched screens: 16 files, 174 tests pass.
- `npm run check`: passes (a first run hit an unrelated "bad port" flake in backend tests, which passed on rerun).
