# #103 Replace InBody import and the preview table with shared components (step 5)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-inbody-preview`

## Purpose

This is the fifth PR in moving #103 over one element at a time. After step 4 (body records screen, #235), move the "인바디 가져오기" ("import InBody") panel and the preview table of the body records screen. The button that opens the panel is in the page header (#222), so it is unchanged. The remaining step is the `style.css` cleanup (step 6).

## Change — feat: replace InBody import

- `frontend/src/inbody-import.tsx`
  - Panel: replaced `section.card.inbody-import` with a `Card` (`role="region"`, name "인바디 가져오기" ("import InBody"), title h2). The region name that tests look for is unchanged.
  - Hint and file picker: `.form-hint` is a gray box utility, and the file picker is the shared `Label` and `Input` (touch 16px kept).
  - Errors: replaced `.error` with #223's `AlertBanner` and the save result text with the shared `Notice`.
  - Column choice: replaced `fieldset.form-grid` with a utility two-cell layout, and the legend and labels with utilities and `Label`. The column choice is a default `select` with the same look as the machine form.
  - Text read from a photo: gave `details` and `pre` utilities.
  - Preview table: replaced `.table-scroll` with a horizontal scroll area (`role="region"`, name "인바디 미리보기" ("InBody preview"), `tabIndex=0`) so the keyboard can scroll it sideways too (the same way as the 12-week table in #101). Added `scope="col"` to header cells. The save checkbox of a row is the shared `Checkbox`, with the className that keeps the box at 16px and the press area at 44px on touch screens, as in the machine form (override to be removed after the central fix: sirloinbh/project-standards#415). The value cells are the shared `Input`, and the width of number cells is `w-24` (96px) instead of the old 90px limit.
  - "선택한 N건 저장" ("save the N selected") is the shared `Button`.
- `frontend/src/style.css`: removed `.inbody-import`, `.inbody-import label`, `.inbody-import pre`, `.table-scroll`, `.inbody-preview input[type='number']`, and the touch-screen `.inbody-preview input[type='checkbox']`. `.heading-actions` stays because the page header (#222) still uses it, and its comment was fixed to match its real use. The touch rule `.legacy label:has(> input[type='checkbox'])` stays because the rest days in the Routine planner still use it.
- Screen difference: the panel gets the shared card look, and the table gets a border and a header background. An error shows as a bordered alert box.

## Tests

- Added: 2 tests in `frontend/src/inbody-import.test.tsx`.
  - Preview: check the panel title (h2), that the table is inside a named scroll area with `tabindex=0`, the order of header cells, that turning off a row's save `checkbox` disables "선택한 0건 저장" ("save 0 selected") and turning it on again saves, and that the save result is announced as `status` and the row keeps "저장함" ("saved").
  - Error: check that choosing a CSV with no measurement line shows an `alert` inside the panel and no table appears.
- The existing 3 tests pass as they are because the label names (`getByLabelText`) are the same. The shared `Checkbox` is also found by `aria-label`, and `toBeChecked` and `toBeDisabled` still work.
- `npm run test -w frontend -- src/inbody-import.test.tsx src/body.test.tsx`: 11 pass right after the replacement, and `inbody-import.test.tsx` 5 pass after the tests were added
- `npm run typecheck -w frontend`, eslint (changed files), prettier: pass
- Limitation: the e2e fixed screen does not open the InBody panel, so this panel is not covered by the visual baseline, touch, or axe checks. It is checked only with the screen tests. The full local `npm run check` and e2e were not run because there is a history of running out of memory.

## Change — first review and merge main

- The first review had no required follow-ups. The 2 optional ones are passed to step 6 (`style.css` cleanup). The disabled look of the column choice `select` is done when the select constants are merged, and showing the failure text of a partial row save as an `AlertBanner` is done together with the `AlertBanner` replacement of the backup screen. There was no code follow-up, so there is no second review.
- CI for `9e7836a` all passed, and there was no visual baseline change.
- Just before the merge, #232 (#105 set cards) entered main. There are no overlapping files, but there are a shared part (`components/number-input.tsx`) and e2e changes, so it did not meet the condition to merge right away and `origin/main` was merged. There were no conflicts. After the merge, `npm run test -w frontend -- src/inbody-import.test.tsx src/body.test.tsx` gave 13 pass and `npm run typecheck -w frontend` passed.
- Then #233 (#102 Routine planner) entered main and `style.css` overlapped, so `origin/main` was merged again. There were no conflicts (main removed the Routine planner rules and this branch removed the InBody rules). After the merge, `npm run test -w frontend -- src/inbody-import.test.tsx src/body.test.tsx src/routines.test.tsx` gave 21 pass, and `npm run typecheck -w frontend` and prettier passed.
