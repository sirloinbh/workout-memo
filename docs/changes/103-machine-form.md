# #103 Replace the machine create and edit form and the official reference values with shared components (step 3)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-machine-form`

## Purpose

This is the third PR in moving #103 over one element at a time. After step 2 (machine list, #230), move the inputs of the machine create and edit modal and the official reference value hint. The modal frame (`Modal`) is already the shared Dialog wrapper, so it is left as is. The remaining steps are the body record trend and record form, the InBody import preview table, and the final `style.css` cleanup. Replacing the failure and warning text of the backup screen with `AlertBanner` goes into step 6, as the coordination window requested.

## Change — feat: replace the machine form

- `frontend/src/app.tsx` (machine edit modal)
  - Labels: replaced the legacy `<label>` with the shared `Label` and the `fieldLabel` of the My goals form (#102) (label on top, input below). The error text (`FieldError`) stays outside the label.
  - Machine name and default weight: the shared `Input` with the touch 16px keeper (`touchText`) added.
  - Brand and official reference value: kept the browser's default `select` and gave it the `selectField` utility, which looks like the shared `Input`. The shared `Select` (Radix) picks values in a different way, so every `selectOptions` in the screen tests would need to change (the same judgment as the #101 set row).
  - Notes on verification material: `components/ui` has no `Textarea`, so this is a default `textarea` with a `textareaField` utility of the same look.
  - Single-joint exercise machine: replaced the default checkbox with the shared `Checkbox` and `Label htmlFor`. It is a value saved together with the form, so by the design system rule it is a `Checkbox`, not a `Switch`.
  - Hint paragraphs (3 places of `.form-hint`): replaced with the same `formHint` utility (gray background box) as the hint in the My goals form.
  - Official reference value hint (`div.official-ref`, `role="note"`): replaced with a bordered gray box utility, gave each paragraph text utilities, and underlined the "제조사 공식 출처" ("official manufacturer source") link.
- `frontend/src/style.css`: removed `.official-ref`, `:where(.legacy) div.official-ref`, `div.official-ref p`, `.modal .rest-auto`, and `.modal .rest-auto input`, and took `div.official-ref` out of the contrast rule at the end. `.form-hint` stays because exercise analysis, body records, InBody, the Routine planner, and journal edit still use it, and `.modal label/input/select/textarea` stay because journal edit (the scope of #105) still uses them.
- Screen difference: the label text goes from 11px to 12px, and inputs change to the shared `Input` height (36px, 44px on touch). The checkbox gets the shared look, and the line spacing inside the official reference value box narrows. The official reference value title goes from 12px to 14px, and the margin below the box from 12px to 16px.

## Tests

- Added: 1 test in `frontend/src/official-weights.test.tsx`. It checks that the brand and the official reference value (`combobox`), the machine name and the notes (`textbox`), the default weight (`spinbutton`), and the single joint (`checkbox`) can all be found by name, that pressing the visible label also turns on the checkbox, and that the save request contains the notes and `single_joint: true`.
- Existing: the official reference value link and brand change (`official-weights.test.tsx`), brand required (`forms.test.tsx`), and single-joint save (`rest-by-exercise.test.tsx`) pass as they are because the label structure is the same.
- `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx src/forms.test.tsx src/machines.contract.test.tsx`: 18 pass, and `official-weights.test.tsx` 8 pass after the test was added
- `npm run typecheck -w frontend`, eslint (changed files), prettier: pass
- The full local `npm run check` and e2e were not run because there is a history of running out of memory. e2e (responsive, axe, touch, visual baselines) is checked by the PR CI.

## Change — fix: first review follow-up

- Touch checkbox size (required): the shared `Checkbox` is a `<button role="checkbox">`, so it was caught by the touch rule at the end of `style.css`, `.legacy button { min-width: 44px; min-height: 44px }`, and grew into a 44px square. Added `pointer-coarse:min-h-4 pointer-coarse:min-w-4` as in `Switch`, so the box stays at 16px and is pressed through the `::after` area (44px) of the shared `Checkbox`.
- `e2e/ui-touch.spec.ts`: the existing check treated the checkbox as a plain button and passed it at 44px, so it missed this problem. It now excludes `[role="checkbox"]` from the button check, and, as with the switch, checks that the `::after` press area is at least 44x44px and fails if the box itself grows beyond 24px.
- Optional: wrote the size change of the official reference value title and box margins into "Screen difference" above.
- Optional (postponed to step 6): `selectField` and `textareaField` (app.tsx) and `nativeSelect` of the backup screen are almost the same string. The body records and InBody screens have the same select too, so they are gathered in one place in the step 6 cleanup.
- `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx`: 15 pass. `tsc -p e2e/tsconfig.json`, eslint, prettier: pass. The touch e2e is checked by the PR CI.

## Change — fix: second review follow-up

- Checkbox press area (required): the `::after` (`-inset-3.5`) of the shared `Checkbox` is measured from inside the 1px border, so it is 42x42px, not 44px. The touch e2e strengthened in the first follow-up catches this as a failure. Put `pointer-coarse:after:-inset-[15px]` in the app-side className to make it 44px. Confirmed that `tailwind-merge` removes the shared `-inset-3.5` and keeps only the new value. The root fix in the shared file (`checkbox.tsx` in `sirloinbh/project-standards`) is central repo work, so the coordination window was told.
- Optional (confirmation only): there was a remark that the `text-muted-foreground` on `bg-muted` contrast of the hint box is 4.35:1 with the light tokens. The app is dark only (#184) and the My goals form passes axe with the same combination, so it is checked with the CI axe result.
- Two reviews are done, so there is no third review.
- `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx`: 15 pass. eslint, prettier: pass
- Remove the override after the central fix: sirloinbh/project-standards#415. When the shared `Checkbox` is fixed, remove `pointer-coarse:after:-inset-[15px]` from the machine form checkbox (and `min-h-4 min-w-4` once the legacy touch rule is gone).

## Change — test: update visual baselines

- In CI `e2e-visual` for `097559e`, only the 4 `machine-editor` 360, 390, 768, 1280 images failed, and 74, including axe, responsive, and the strengthened touch check, passed. The 360 and 1280 images were viewed directly and showed no difference apart from the label and input heights, the hint box, and the shared checkbox, and then the 4 images were updated with the `visual-baselines` artifact. The other images were byte-for-byte the same as the existing baselines.
- Limitation: the brands in the e2e fixed data have no official reference values, so the official reference value choice and the hint box do not appear in the images. They were checked only with the screen tests (`official-weights.test.tsx`).

## Merge main

- Just before the merge, the #102 (exercise analysis) change entered main and overlapped with this branch in `frontend/src/style.css` and `e2e/ui-touch.spec.ts`, so `origin/main` was merged.
- `style.css` conflict: in the same place, main removed the exercise analysis rules (`.analysis-week`, `.exercise-pr`, `.part-editor`, `.trend*`) and this branch removed `.modal .rest-auto`. Both deletions were kept and the place was left empty. In `ui-touch.spec.ts` the automatic merge kept both main's body-part chip check and this branch's checkbox check.
- After the merge, `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx src/analysis.test.tsx` gave 20 pass, and `npm run typecheck -w frontend`, `tsc -p e2e/tsconfig.json`, and prettier passed
