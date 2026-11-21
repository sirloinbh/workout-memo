# Keep customised split body parts when the split count changes (#385)

Issue: https://github.com/sirloinbh/workout-memo/issues/385

## Purpose

Changing the split count replaced every split's body parts and the cycle, even ones the user had set, and routine cardio labels showed "undefined km" or an empty gap for items still being filled in.

## Changes

- `withSplitDefaults` (`frontend/src/routines.tsx`) now fills only what is untouched. A split whose body parts are empty or still the previous count's defaults gets the new defaults, and a new split gets its defaults; a customised split keeps its parts. The cycle is filled only in cycle mode and only while it is unset or still the previous count's default, so weekday mode and a customised cycle are left alone.
- `cardioLabel` (`frontend/src/routine-cardio.ts`) shows a dash for an empty minutes, distance, repeats or interval time instead of "undefined" or a blank.

## Verification

- Screen test: customise split 1, change the count from 2 to 3, and split 1 keeps its parts while the untouched split and the new split follow the new defaults.
- Unit test (`routine-cardio.test.ts`): empty steady, distance and interval items contain no "undefined" or "NaN".
- The existing #88 test (defaults at every count) still passes.
- `npm run check`: passed.

## Limits

- "Customised" means different from the previous count's default parts; a user who sets parts equal to the default is treated as untouched.
