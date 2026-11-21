# Use the UI kit number input and delete the local copies (#464)

Issue: https://github.com/sirloinbh/workout-memo/issues/464

## Purpose

#383 kept local copies of the number input and stepper so an emptied weight or reps field stays empty instead of becoming 0. The kit now supports that (project-standards#972, synced in PR #463), so the copies are removed.

## Changes

- `workspace/workout-editor.tsx` imports `NumberValueInput` from `components/ui/number-input` and passes `allowEmpty` on the weight and reps fields. An emptied field still reports `undefined`.
- `cardio/cardio-form.tsx` imports `NumberInput` from the kit; `cardio/format.ts` re-exports `optionalNumber` from `components/ui/number-step`.
- Deleted `components/number-input.tsx`, `components/number-step.ts` and `components/number-input.test.tsx`. The kit has its own `components/ui/number-input.test.tsx` with the same cases plus `allowEmpty`.

## Verification

- `npm run check`: passed (lint, typecheck, backend and frontend unit tests, build).
- Screen test in `forms.test.tsx` (clear the weight, save, see the field error, no request sent) still covers the #383 behavior.

## Limits

- No behavior change is intended. No contract or API change.
