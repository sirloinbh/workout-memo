# #312 View plan asks before it discards a routine draft

- Issue: [#312](https://github.com/sirloinbh/workout-memo/issues/312)
- Decision (user, 2026-11-16): option 1, confirm before replacing.

## Purpose

On the Routine Builder page, "View plan" closed an open new-routine draft as soon as the plan loaded, so everything entered in the four steps was lost without a warning.

## Changes

- `frontend/src/routines.tsx`: with a draft open, "View plan" opens the shared `ConfirmDialog` ("Discard the new routine you are entering?") instead of loading the plan. "Discard and view plan" loads it and closes the draft; "Keep editing" (or Escape) leaves the draft as it was and loads nothing. Without a draft the plan opens directly, as before. Focus returns to the "View plan" button that asked.
- The plan loading moved into one `openPlan` function shared by both paths.

## Verification

- `routines.test.tsx`: two new tests. With a draft, the dialog appears and no plan request is sent; Keep editing keeps the form and its entered name and returns focus; Discard and view plan opens the plan and closes the form. Without a draft, the plan opens with no dialog. `npm run test -w frontend -- routines`: 17 passed.
- Review round 1 (no blocking findings): added a test that a plan failing to load after Discard keeps the draft and shows the error; routines tests 18 passed. "Create new routine" also replaces an open draft silently; split off as [#323](https://github.com/sirloinbh/workout-memo/issues/323) because #312 covers only View plan.
- Chrome (production build, mocked API) at 390×844 and 1440×900: the dialog fits (358px wide at 390, 512px centered at 1440), no horizontal scroll, Keep editing keeps "Unsaved routine", Discard opens the plan with no form, and focus is back on "View plan" both times.
- Format, lint, typecheck and docs checks: see the PR. CI `verify` runs the full `npm run check`.

## Limits

- The draft is still kept only in memory; leaving the page or reloading drops it as before.
- "Create new routine" with a draft open still replaces it without asking: [#323](https://github.com/sirloinbh/workout-memo/issues/323).
