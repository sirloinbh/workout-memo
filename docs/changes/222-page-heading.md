# #222 Replace the page header and main buttons with shared components

- Issue: [#222](https://github.com/sirloinbh/workout-memo/issues/222)
- Branch: `feat/222-page-heading`

## Purpose

In #101 (dashboard and log) and #102 and #103 (My goals, machine library, body records), the cards and forms of each screen were moved to shared components, but the page header was left in the legacy style. The targets are the eyebrow, the `h1`, the dot at the end, the description paragraph, and the main button at the top right. I change this header to a shared part and delete the `style.css` rules that nothing uses any more.

## Change — feat: replace the page header

- `frontend/src/components/page-header.tsx` (new file): `PageHeader` takes `eyebrow`, `title`, `description`, and `actions`.
  - The faint dot at the end of the title is left inside the `h1`, so the title that screen readers read is the same as before.
  - On a phone the button goes below the text, and from `md` (768px) it goes to the right.
  - The element is a `div`. If it were a `header`, in the test environment it would be read as a second `banner` region separate from the header of the app shell, which could confuse screen readers and axe.
  - I did not edit the `components/ui` central files.
- `frontend/src/app.tsx`: changed `.page-heading` of the dashboard, workout log, My goals, and machine library to `PageHeader`.
  - The main buttons ("운동 기록하기" (log a workout), "목표 추가" (add a goal), "머신 등록" (register a machine)) change from `button.primary` to the shared `Button` (default).
  - The behavior of disabling the button on the dashboard and the log when there is a local draft is the same as before.
- `frontend/src/body.tsx`: the body records header is also a `PageHeader`.
  - "인바디 가져오기" (import InBody) changes from `.subtle-button` to `Button` (`secondary`), and `aria-expanded` tells whether the panel is open.
  - "신체 기록 추가" (add a body record) becomes a `Button`, and I added a `+` icon like the other screens.
- `frontend/src/style.css`: deleted the rules below.
  - `.page-heading` (+`p`), `.eyebrow`, `:where(.legacy) h1`, `.heading-dot`, `.primary` (+`:hover`)
  - The whole 1100px media rule and the header part of the 760px media rule
  - `.heading-actions`, and `.legacy a.primary` of the touch rules
  - `.subtle-button` and `.modal .subtle-button` are left because the log edit dialog (scope of #105) still uses them. The `style.css` classes left are only `.modal …`, `.form-grid`, `.form-hint`, `.workout-fields`, and `.subtle-button` of the log edit dialog, `.field-error` of `FieldError`, and the `.legacy` element rules.
- Differences on screen
  - The main button gets the shared `Button` size (36px, touch 44px) and text (14px).
  - The title is 24px and, from `xl` (1280px), 28px. Before, it was 23px at 1100px and below.
  - The description is 12px, and the rule that made it 11px at 760px and below is gone.
  - The margin below the header is 24px on a phone and 36px from `md`.

## Tests

- Added: 2 tests in `frontend/src/components/page-header.test.tsx`.
  - Display: checks that the eyebrow, the `h1` (including the dot at the end), the description, and the button appear, and that no `banner` region is created.
  - No button: checks that it does not draw an empty button group when there is no `actions`.
- Changed: in the draft recovery test of `frontend/src/workout-draft.test.tsx`, it checks that "운동 기록하기" in the header before the recovery is disabled. There had been no test that checks this behavior. In `frontend/src/inbody-import.test.tsx`, it checks that pressing "인바디 가져오기" makes `aria-expanded="true"`.
- `npm run test -w frontend -- src/components/page-header.test.tsx src/workout-draft.test.tsx src/period.test.tsx src/body.test.tsx src/goal-list.test.tsx src/official-weights.test.tsx src/routing.test.tsx src/inbody-import.test.tsx`: 79 pass
- `npm run typecheck -w frontend`, eslint (changed files), prettier: passed
- I did not run the local full `npm run check` and e2e because of a history of running out of memory. e2e (responsive, axe, touch, visual baselines) is confirmed with the PR CI. I expect the baselines of the dashboard, journal, goals, machines, and body screens that have the header, and of the modal images that appear over them, to change.

## Change — first review fixes

- The first review had no required fixes, and I applied 4 optional ones.
  - Description paragraph: `text-meta` reduced the line height to 16px, so the space between lines of a description with two or more lines (body records) got narrow. I keep the old `1.7` as `leading-[1.7]`.
  - Title letter spacing: `tracking-tight` is wider than the old -1.2px, so I matched it with `tracking-[-1.2px]`.
  - `e2e/ui-touch.spec.ts`: I removed `a.primary`, which no longer selects anything, from the targets of the touch size check.
  - `frontend/src/workout-draft.test.tsx`: after the recovery, it also checks that the header button is active again.
- I wrote `PageHeader` in the description of the app-specific components in `docs/design-system.md`.
- `npm run test -w frontend -- src/workout-draft.test.tsx src/components/page-header.test.tsx`: 24 pass. prettier passed

## Change — second review and visual baseline update

- The second review had no required fixes. I applied 1 optional one. The `a.primary` that the touch size check selected has selected nothing since the download link of the backup screen became `Button asChild` in #103. So I put `a[data-slot="button"]` in the targets of `e2e/ui-touch.spec.ts`, so button-shaped links are also checked for 44px height. Two reviews are done, so there is no third review.
- In the CI `e2e-visual` of `deb9d57`, only 29 visual comparisons failed. The axe, responsive, and touch checks passed.
  - What changed: 4 widths each of `dashboard`, `journal`, `goals`, `machines`, and `body`, which have the header, and `workout-editor` (390, 768, 1280), `goal-editor` (4 widths), and `machine-editor` (768, 1280), which show the header behind them.
  - Check: I looked at `dashboard-1280` side by side with the previous baseline, and I also looked at `body-360` directly. Other than the main button text growing from 12px to 14px and the header spacing changing, there was no difference.
  - Update: I updated 29 images with the `visual-baselines` artifact. The other images were the same as the existing baselines byte for byte.

## Merge of main

- Just before the merge, #241 (#125 exercise analysis mobile) entered main and `e2e/ui-touch.spec.ts` overlapped, so I merged `origin/main`. There were no conflicts, and both the target selector of this branch and the exercise analysis check of #241 remain. After the merge, `tsc -p e2e/tsconfig.json` and the related screen tests passed.

## Merge of #237

- #237 (#105 log edit set card) entered main and I merged `origin/main`. There were no code conflicts. 5 visual baselines (`goal-editor` 360 and 390, `workout-editor` 390, 768, and 1280) were changed on both sides and conflicted. An image that has both changes is on neither side, so I kept the main side for now and update them again with the CI artifact of this merge commit.
- After the merge, `npm run typecheck -w frontend` and `tsc -p e2e/tsconfig.json` passed. `npm run test -w frontend -- src/components/page-header.test.tsx src/workout-draft.test.tsx src/body.test.tsx src/inbody-import.test.tsx src/period.test.tsx`: 62 pass
- In the CI `e2e-visual` of `d807b68`, only 6 modal baselines failed, and 81 checks including axe, responsive, and touch passed. The failed baselines are `goal-editor` 360 and 390, `machine-editor` 360 and 390, and `workout-editor` 768 and 1280. I looked directly at `machine-editor-390` and `workout-editor-1280` and confirmed that there was no difference other than the modal layout of #237 and the header of this PR showing together. After that I updated 6 images with the `visual-baselines` artifact. The other images were the same as the existing baselines byte for byte.
