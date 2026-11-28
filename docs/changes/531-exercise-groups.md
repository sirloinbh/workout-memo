# #531 Enter the exercise name once per exercise

- Issue: https://github.com/sirloinbh/workout-memo/issues/531 (epic #524)
- Branch: feat/531-exercise-groups

## What changed

- The editor shows exercise groups: one card per exercise with its name (autocomplete and similar-name hint) and machine once, then that exercise's sets (weight, reps, memo, done) below, an "Add set" button per exercise, and "Add another exercise" at the bottom. Renaming or changing the machine applies to every set of the group. The routine reference line shows once per exercise.
- Grouping is a client-only `_group` id on each set (like `_key`). `withSetKeys` assigns it: a set without one joins the set before it when both names match (trimmed, case-insensitive), otherwise it starts a new group. So an old workout groups consecutive equal names, and the same name apart stays two exercises. `withoutSetKeys` strips it before saving. A new journal's three blank sets are one exercise.
- Set numbering ("Set N", "Set N done") stays continuous across the whole workout.

## Choice for implementation

- The API, `sets.exercise` and the backup format are unchanged: the UI sends the group name on every set, so no migration or backup change.
- Draft storage keeps the same format. Drafts saved before this change have no `_group` and are regrouped by name when restored; a new draft stores `_group` with the sets.

## Tests

- Updated the editor tests that expected a name field on every set (`forms`, `new-workout-defaults`, `routine-progress`, `workout-draft`) and the e2e specs for the defaults and the mobile flow. New `exercise-groups.test.tsx` covers grouping of old workouts, the stripped id, one name per exercise, add set, add another exercise, and the saved body.

## Verification

- `npm run check` without `TEST_DATABASE_URL`. Real-browser check at 390x844 and 1440x900 (frontend rule): not run locally (no Docker or test DB, low RAM); CI e2e responsive, touch, axe and visual specs cover the editor at 360, 390, 768 and 1280, and the refreshed `workout-editor-*` baselines were looked at (see the PR).
