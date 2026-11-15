# #173 Shared Skeleton and Spinner for the cardio record list and the cardio save button

- Issue: [#173](https://github.com/sirloinbh/workout-memo/issues/173)
- Branch: `feat/173-cardio-list-loading`

This finishes the last two places that [173-cardio-loading.md](173-cardio-loading.md) left out while #266 (activity file import) changed the same files. #266 is merged.

## Change

- Cardio record list (`cardio/cardio-panel.tsx`): while the records load for the first time, a `SkeletonList` replaces the visible text "Loading records…". It sits in an `aria-busy` region named "Cardio records", and the status line stays as a `sr-only` `role="status"` line. A reload after saving still keeps the list on screen, as before.
- Cardio save button (`cardio/cardio-form.tsx`): while saving, the disabled button shows `Spinner size="sm"` (hidden from assistive tech) next to "Saving…".

After this, no feature screen shows only "loading" text (the done criterion of #173).

## Tests

- `frontend/src/cardio/cardio-panel.test.tsx`
  - New: the first load shows the placeholders in the named busy region with a hidden status line, and both go away when the list arrives.
  - New: the save button is disabled and shows a hidden spinner while the save is pending.
- `npm run test -w frontend -- src/cardio`: 9 files, 78 tests passed.

## Browser check (2026-11-16)

Production build (`npm run build -w frontend`) served on localhost with a stub API that holds the cardio list and delays the save, in Chrome at 390x844 and 1440x900: the placeholder rows appear under the card header and buttons, and the save button shows the spinner and is disabled.

- Seen but not changed: the count badge next to "Cardio records" shows 0 while the list loads.

## Checks

- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:docs`: passed. The full `npm run check` was run in parts because a full local run was stopped for low memory earlier today; CI `verify` runs it whole.
