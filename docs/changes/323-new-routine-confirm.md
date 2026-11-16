# #323 Create new routine asks before it discards a routine draft

- Issue: [#323](https://github.com/sirloinbh/workout-memo/issues/323), split off from the #312 review (PR #322).
- Decision (user, 2026-11-16): option 1, confirm first, the same as #312.

## Purpose

With a new routine draft open, "Create new routine" replaced it with an empty one, and everything entered was lost without a warning.

## Changes

- `frontend/src/routines.tsx`: the #312 confirmation now also covers "Create new routine". With a draft open it asks "Discard the new routine you are entering?" with "Starting over clears the new routine form…"; "Discard and start over" opens an empty draft at step 1, and "Keep editing" keeps the draft and its step. Without a draft it opens a new one directly, as before. The pending action is a saved plan or `'new'`, and the draft reset moved into `startDraft`.

## Verification

- `routines.test.tsx`: a new test. With a draft on step 2, the dialog shows the start-over text; Keep editing keeps step 2 and the entered name and returns focus to the button; Discard and start over shows an empty step 1 and sends no write request. `npm run test -w frontend -- routines`: 19 passed.
- Review round 1 (no blocking findings): the dialog text was derived from the pending action, which clears when the dialog closes, so a closing start-over dialog could flash the View plan wording. The wording is now kept in its own `asking` state set when the dialog opens. The test also checks that the dialog asked from View plan keeps its own wording. `npm run test -w frontend -- routines`: 19 passed.
- Review round 2: no blocking findings. Merged `origin/main` (#117 cardio achievement, PR #324) without conflicts; `npm run test -w frontend -- routines routine-progress`: 30 passed, typecheck and lint passed.
- Chrome (production build, mocked API) at 390×844 and 1440×900: the dialog fits (358px wide at 390, 512px centered at 1440), no horizontal scroll; Keep editing keeps the form, Discard and start over leaves an empty routine name at step 1, and focus is back on "Create new routine" both times.
- Format, lint, typecheck and docs checks: see the PR. CI `verify` runs the full `npm run check`.

## Limits

- The draft is still kept only in memory; leaving the page or reloading drops it.
