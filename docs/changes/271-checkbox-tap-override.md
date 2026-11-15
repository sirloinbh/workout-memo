# #271 Remove the app's temporary Checkbox tap area override

## Problem

The touch tap area of the shared Checkbox was 42px, because `::after` was set to `-inset-3.5` inside the 1px border. So the app overrode it in the machine edit and the InBody preview with `pointer-coarse:after:-inset-[15px]` to make it 44px. With #258 (central project-standards#415 and #433), the shared Checkbox has the same value, so this override is no longer needed.

## Change

- I removed `pointer-coarse:after:-inset-[15px]` from the "단관절 운동" (single-joint exercise) checkbox of the machine edit in `app.tsx` and the row save checkbox in `inbody-import.tsx`, and fixed the comments.
- `pointer-coarse:min-h-4 pointer-coarse:min-w-4` is left as it is. It is the value that stops the old screens' "all buttons 44px" rule from enlarging the box.
- The same override in the routine form (`routines.tsx`) overlaps with agent3's step-by-step routine input work, so I delete it after that PR.

## Checks

- `e2e/ui-touch.spec.ts` checks that the checkbox `::after` tap area is at least 44px and the box is at most 24px (CI).
- `npm run test -w frontend -- src/inbody src/machine src/components/ui/checkbox`: passed (4 files, 14 tests)
