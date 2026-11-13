# #86 Progressive overload weight step: a 5 kg default and a custom value

- Issue: [#86](https://github.com/sirloinbh/workout-memo/issues/86)
- Branch: `feat/86-weight-step`
  - It started on top of `feat/84-rest-by-exercise`. This keeps the migration number order (010 → 011 → 012).
  - The merge order must be #91 (#83) → #92 (#84) → this PR.

## Decisions — 2026-10-21

- It applies to both goal suggestions and the automatic double progression routine.
- The custom value is per exercise.
- The new rule also applies to automatic routines that are already saved. So the expected targets of a routine in progress can change.

## Design

- To satisfy both "per exercise" and "apply to existing routines", the weight step goes in a per-exercise settings table, not in the routine plan (jsonb).
  - The key is the normalized exercise name, the same as the #32 body part setting and the goal judgment.
  - So all routines and goals use the same value, and it takes effect without saving the plan again.
- Right before the calculation, the server attaches `weight_step` to each exercise in the plan (`withWeightSteps`). This value is not stored in the plan.
- Where to edit
  - In My goals (나의 목표) → add a goal, when you enter an exercise name, you change "이 운동의 증량 단위" (the weight step of this exercise) and it is saved right away.
  - Routine planning (루틴짜기) only displays the per-exercise value.

## Change

- DB `012_exercise_weight_steps.sql`: `exercise_weight_steps(exercise PK, weight_step numeric(6,2) above 0 and at most 100)`. It is safe to re-run.
- Contract `weightStepSchema`, `defaultWeightStep = 5`
  - It allows above 0, at most 100 kg, and up to two decimal places.
  - `null` returns it to the default.
- API (`backend/src/routes/weight-steps.ts`)
  - `GET /api/exercise-weight-steps`: the weight step per specified exercise
  - `PUT /api/exercise-weight-steps`: saves it, or deletes it when `null`.
  - `GET /api/goal-suggestion?exercise=`
    - It uses the most recent goal of that exercise as the base, and if there is none, the heaviest completed set of the most recent journal.
    - It suggests the base plus the weight step. If there is neither, it is `base: null`. It saves nothing.
- Automatic double progression (`backend/src/progress.ts`, `frontend/src/progression.ts`)
  - When the rep ceiling is exceeded, it goes up by `weight_step` (default 5 kg).
  - I removed the earlier "about 5% (in 2.5 kg units, minimum 2.5 kg)" rule (`incrementFor`).
  - Bodyweight (0 kg) only adds reps as before, and the deload (90% of the previous target, in 2.5 kg units) is also the same.
  - `/api/routine-progress` (including the rest choose and cancel responses) calculates with the plan that has the stored weight steps applied.
- Screen
  - I added "다음 목표 제안" (next goal suggestion) to the add goal form.
    - Showing the suggestion and "제안 적용" (apply suggestion) (fills the goal total weight)
    - Entering and saving the weight step of this exercise (validated by the contract first), and returning to the default
  - Routine planning: the preview uses the per-exercise weight step. The saved plan view shows `증량 단위 N kg` (weight step N kg), and I changed the rule description.
- Documents: `docs/api.md`, `database/README.md`, `README.md`, `docs/openapi.json`

## Tests

- `backend/test/weight-steps.test.ts` (new)
  - Contract boundaries (0, 100.01, a third decimal place, a string)
  - DB integration
    - With no records, it makes no suggestion. It excludes incomplete sets and uses the heaviest set of the recent journal as the base.
    - Saving a weight step is reflected in the suggestion. If there is a goal, the goal takes priority.
    - The next session of an already saved automatic routine uses a 2.5 kg step. Returning to the default goes back to 5 kg.
- `backend/test/routine-progression.test.ts`
  - I changed the 5% rule test to "default 5 kg, per-exercise steps (2.5, 1.25, and 10 kg), and bodyweight stays".
  - I updated the expected order of the dumbbell curl and the 2-split squat to the 5 kg rule. It also checks that specifying 2.5 kg gives the earlier order.
  - I pass a `require` stand-in so the screen preview equivalence test receives the contract default.
- `frontend/src/goal-suggestion.test.tsx` (new)
  - Showing and applying the suggestion
  - Updating the suggestion after saving a weight step, not sending a bad value, and returning to the default
  - The notice when there is no base
- `frontend/src/routines.test.tsx`: I updated the preview expected values (40 kg → 45 kg, +5 kg).

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 293 pass, 0 skip (including the DB integration)
  - Frontend 99 pass
  - Workers 162, skills 4, docs 3, and build pass
  - The first run failed at the dumbbell curl week 5 expected value of `routine-progression.integration.test.ts` (45x9 under the 5% rule). I changed it to the value of the 5 kg rule (50x9), ran it again, and it passed.
- `npm run test:e2e` (the same test DB): 4 passed. I did not add e2e for this change.

## Limits and follow-up

- The weight step is not included in the app backup (JSON). This is the same existing scope as the #32 body part setting.
- The only place to change the weight step is the add goal form. A feature to change it directly in routine planning or exercise analysis can be added separately if needed.
- Existing automatic routines are recalculated on the 5 kg basis per the user's decision, so the later expected targets of a routine in progress may differ from what was shown before.
