# Stop number inputs turning empty or odd text into numbers (#383)

Issue: https://github.com/sirloinbh/workout-memo/issues/383

## Purpose

Clearing a set's weight and saving recorded 0 kg, and the stepper read text with `Number()`, so `'0x10'` stepped from 16 and `'1,000'` was replaced.

## Changes

- `components/number-step.ts` now holds the one number reader (`optionalNumber`, moved from `cardio/format.ts`, which re-exports it). `stepValue` uses it, so hex, exponent and thousands-separated text count as unreadable (the minimum, or 0), like the cardio form.
- `NumberValueInput` reports an emptied field as `undefined` instead of 0. Set weight and reps are `number | undefined` while editing.
- `saveWorkout` validates an emptied weight or reps as `NaN`, so the shared contract answers "Enter a total weight as a number" on that field and nothing is sent.
- A local draft with an emptied weight or reps is still accepted when it is restored.

## Verification

- Unit tests: `stepValue('0x10', 1)` and `stepValue('1,000', 1)` match the form reader; an emptied `NumberValueInput` reports `undefined`.
- Screen test (`forms.test.tsx`): clear the weight, save, see the field error, no request sent.
- `npm run check`: passed (one backend test failed once on a random fetch-blocked port, "bad port", and passed on rerun).

## Limits

- No contract change (`shared/contract.ts` is not touched), so the message for an emptied field reuses the "as a number" wording.
