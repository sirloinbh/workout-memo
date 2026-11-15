# #317 Shared Spinner while the sign-in gate checks the session

- Issue: [#317](https://github.com/sirloinbh/workout-memo/issues/317)
- Branch: `feat/317-sign-in-loading`

## Why

While the shared sign-in gate (#303) checks the session, the whole page showed only the text "Checking your sign-in…". It was the last loading spot without the shared `Spinner` (#173 rule).

## Change

- `frontend/src/sign-in.tsx`: the checking state shows `Spinner size="sm"` (hidden from assistive tech) beside the `role="status"` line, in an `aria-busy` region named "Sign-in check". The session check, the redirect to sign-in, and the error state with "Try again" are unchanged.

## Tests

- `frontend/src/sign-in.test.tsx` (new, 2 tests; the location is stubbed to the production address, where the gate runs):
  - While `/api/me` is pending: the status line, the named busy region and the hidden spinner; the app content appears and the busy region goes away once the user arrives.
  - A failed check (503) still shows the alert and "Try again", without the spinner.
- `npm run test -w frontend -- src/sign-in.test.tsx src/auth-origin.test.ts`: 2 files, 4 tests passed.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed. The full `npm run check` is run by CI `verify` (a whole local run is stopped for low memory on this PC).

## Browser check (2026-11-16)

Production build served locally, with Chrome mapping a non-local host name to it (`--host-resolver-rules`) so the gate runs, and `/api/me` left unanswered: at 390x844 and 1440x900 the spinner shows beside "Checking your sign-in…" in the middle of the page.
