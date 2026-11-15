# #103 style.css cleanup and replacing the remaining warning text (step 6)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-style-cleanup`

## Purpose

This is the last PR in moving #103 over one element at a time. It cleans up what steps 1 to 5 (backup #225, machine list #230, machine form #231, body records #235, InBody #236) left behind.

- Delete the rules in `style.css` that no screen uses any more.
- Gather the form class constants scattered over steps 1 to 5 into one place.
- As the coordination window requested, replace the failure text and the replace-all warning of the backup screen with #223's `AlertBanner`. Also apply the 2 optional remarks from the #236 review (the disabled look of the column choice, the failure text of a partial row save).

## Change — refactor: cleanup

- `frontend/src/style.css`: looked for each class name as a word across all of the source (`frontend/src`, `e2e`), and removed the rules that have no `className` use.
  - Removed rules: `.card`, `.section-title` (+ `p`, the 760px rule), `.count` (+ the contrast rule list), `.text-button`, `.empty` (+ `h3`, `p`), `.workout-row` (+ `:last-child`, the 760px rule), `.workout-info` (+ `h3`, `p`, the 760px rule), `.icon-button`, `.full`. `workout-row` now remains only as a `data-slot` name.
  - Kept rules: `:where(.legacy) h2` (page titles of exercise analysis, the Routine planner, and backup), `.form-grid`, `.modal ...`, `.workout-fields`, and `.subtle-button` (journal edit #105), `.form-hint` (journal edit), `.page-heading`, `.eyebrow`, `.heading-dot`, `.primary`, and `.heading-actions` (page header #222), `.routine-page` (Routine planner), and `.field-error` (`FieldError`). `.error` and the period rules of exercise analysis were cleaned up under "#239 merge" below.
- `frontend/src/components/form-styles.ts` (new file): put the shared form classes `fieldLabel`, `touchText`, `selectField`, `textareaField`, and `formHint` in one place. Until now `app.tsx` (My goals and machine forms), `body.tsx`, `inbody-import.tsx`, and `backup.tsx` each held the same strings.
  - Added `disabled:cursor-not-allowed disabled:opacity-50` to `selectField` and `textareaField` (#236 review optional 1). The InBody column choice fades when the `fieldset` is disabled during saving, and the machine form never becomes disabled, so its look is the same.
  - `nativeSelect` of the backup screen becomes `selectField`, with `text-foreground` and `aria-invalid:border-destructive` added. There is no visible difference on screen.
  - The hint box of the My goals form and the hint box of the machine form use the same `fieldHint` (`formHint` + `mb-4`).
  - Listed this file in the composition table of `docs/design-system.md`.
- `frontend/src/backup.tsx`: changed the failure text from `Notice` (error) to `AlertBanner`. The delete warning of the replace-all preview changed from a red text paragraph to an `AlertBanner`, placed separately right above the preview summary (`role="status"`) instead of inside it, so live notification areas do not overlap.
- `frontend/src/inbody-import.tsx`: when only some rows fail to save, "N건은 저장하지 못했습니다. 표의 확인 칸에서 이유를 보고 고친 뒤 다시 저장하세요." ("N could not be saved. Check the reason in the confirmation column of the table, fix it, and save again.") shows as an `AlertBanner` (#236 review optional 2). The saved count is still a `Notice`.
- Screen difference: the errors and the replace-all warning of the backup screen become bordered alert boxes. A partial InBody failure also shows as an alert box. The e2e fixed screens do not have these states, so no visual baseline change is expected.

## Check against the #103 completion criteria

- "The whole app uses only `components/ui` and tokens": no `style.css` class remains in the body records, machine library, and backup screens and the InBody panel, which are the scope of #103. The exceptions are the page header (`.page-heading`, `.primary`, `.subtle-button`, `.heading-actions`) and the legacy element rule for the page title `h2`, which are in the scope of #222. The rules used by other screens (exercise analysis #102, journal edit #105, Routine planner) are cleaned up by each issue.
- "Existing tests pass, with before and after screenshots": at each step the before and after images of CI `e2e-visual` were checked and the baselines were updated (see each step's record).

## Tests

- Changed: in the replace-all test of `frontend/src/backup.test.tsx`, added a check that the delete warning is an `alert` and is outside the `status` summary. In the CSV save test of `frontend/src/inbody-import.test.tsx`, added a check that a partial failure is announced as an `alert` ("1건은 저장하지 못했습니다", "1 could not be saved") and the saved count is announced separately as `status`.
- `npm run test -w frontend -- src/backup.test.tsx src/inbody-import.test.tsx src/body.test.tsx src/official-weights.test.tsx src/rest-by-exercise.test.tsx src/forms.test.tsx src/goal-suggestion.test.tsx src/goal-list.test.tsx`: 43 pass (`backup` and `inbody-import` 11 pass after the checks were added)
- `npm run typecheck -w frontend`, eslint (changed files), prettier: pass. `npm run knip` reports only the same existing items as main, and `form-styles.ts` does not appear.
- The full local `npm run check` and e2e were not run because there is a history of running out of memory. e2e (responsive, axe, touch, visual baselines) is checked by the PR CI.

## Change — first review and merge main

- The first review had no required follow-ups. It confirmed that none of the 9 removed classes is used as a real class anywhere. As 1 optional item, also noting that `min-w-0` was added to the backup select and `aria-invalid:border-destructive` to the InBody select (no screen difference). There was no code follow-up, so there is no second review.
- CI for `5ecbbbc` all passed, and there was no visual baseline change.
- Just before the merge, #238 (#102 Routine planner plan) entered main and `style.css` overlapped, so `origin/main` was merged. There were no conflicts.
- #238 changed the default checkbox of the Routine planner to the shared `Checkbox`, so nothing uses the touch rule `.legacy label:has(> input[type='checkbox'])` any more. This rule was removed too. There is no input with `type="checkbox"` in the app source now.
- After the merge, `npm run test -w frontend -- src/backup.test.tsx src/inbody-import.test.tsx src/routines.test.tsx src/rest-by-exercise.test.tsx` gave 28 pass, and `npm run typecheck -w frontend` and prettier passed

## Change — #239 merge and removing `.error`

- After CI passed, just before the merge, #239 (#102 exercise analysis period) entered main and `style.css` overlapped, so `origin/main` was merged again.
- 2 `style.css` conflicts: in the same place, main removed the `.period-bar`, `.date-control`, and `.range-label` (and the 760px rule) of exercise analysis, and this branch removed `.card`, `.section-title`, `.workout-row`, and `.workout-info` (and the 760px rule). Both deletions were kept and the place was left empty.
- #239 changed the error of exercise analysis to `AlertBanner`, so nothing uses the `.error` class any more (checked `className`, `classList`, and `querySelector` with `rg`; the remaining `'error'` is the `kind` value of `Notice`). As the coordination window requested, removed `.error` and `.error button`.
- After the merge, the class list check found no unused rules left. `npm run test -w frontend -- src/analysis.test.tsx src/backup.test.tsx src/inbody-import.test.tsx src/body.test.tsx src/routines.test.tsx` gave 35 pass, and `npm run typecheck -w frontend` and prettier passed
