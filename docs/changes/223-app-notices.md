# #223 Replace the connection error and save warning notices with shared components

- Issue: [#223](https://github.com/sirloinbh/workout-memo/issues/223)
- Branch: `feat/223-app-notices`
- Parent issue: #213 Replace the screens with shared UI components

## Purpose

Even after #101, the notices at the top of the dashboard and the workout log (connection error, save warning, save status) were the legacy `.error` style and a plain `button`. I decide on shared notice parts and move the notices of `app.tsx`.

## Part decision

- `components/ui` (centrally managed) has no `Alert`. The only one is `Notice` (#311), which is a one-line paragraph that only changes the text color, so it cannot hold a box and an action button like "다시 연결" (reconnect).
- So I split it in two.
  - Failure and warning: `AlertBanner` in the new project part `frontend/src/components/alert-banner.tsx`. It is a box painted with `role="alert"` and shared tokens (`destructive` border, a 4px line on the left, `bg-destructive/10` background), and the shared `Button` goes into `action`. The text is `text-foreground` (see the first review fixes). The default bottom margin is `mb-5` (20px of the legacy `.error`) and can be changed with `className`.
  - A one-line progress or success note (save status): the central shared `Notice` (`role="status"`).
- Whether to ask the central repo to add `Alert` will be decided after the other screens (#102 and #103) have tried this part. If its use becomes settled, I move it then.

## Change — feat: replace the notices at the top of the app and in the log edit dialog

- `frontend/src/app.tsx`
  - Connection error: replaced `div.error` + a plain `button` with `AlertBanner`, and "다시 연결" with `Button` (`outline`, `sm`).
  - Save warning (local storage error): `AlertBanner` both at the top of the app and in the edit dialog.
  - Save status ("저장 중…" (saving…), "서버 저장 완료" (saved to the server), and so on): `Notice` both at the top of the app and in the edit dialog. It is not drawn when the string is empty (`statusNotice`).
  - Save failure in the edit dialog: `AlertBanner`, and "다시 저장 재시도" (retry saving) is a `Button` (`outline`, `sm`). It cannot be pressed while saving, as before.
  - The range URL error in the same file (left over from #224) and the rest timer warning were also moved to `AlertBanner`.
  - `role="alert"`, `role="status"`, and the texts are the same.
- `frontend/src/style.css`: no rules were deleted. `.error` and `.error button` are still used by the exercise analysis and routines (#102) and by the body records, backup, and InBody import (#103). Those screens are moved to `AlertBanner` in their own issues.
- Differences on screen: the error text grows from 12px to 14px. "다시 연결" and "다시 저장 재시도" change from underlined text to bordered buttons. The save status text becomes 14px gray text. The corner radius is the same as before (`rounded-md` = `calc(var(--radius) - 2px)`).
- Differences in spacing: the error box at the top of the app has 20px below as before. The save status line at the top of the app gets a 20px (`mb-5`) below that it did not have before. The warning and failure boxes and the save status in the edit dialog have 12px (`mb-3`, the old box had 20px) below. The range URL error has 12px above (`mt-3 mb-0`) instead of 20px below.

## Tests

- Added: 2 tests in `frontend/src/components/alert-banner.test.tsx`. They check that the notice is `role="alert"` and that the action button is inside the box and is called when pressed, and that without an action there is no button and that `className` changes the default margin.
- Added: 2 tests in `frontend/src/workout-draft.test.tsx`. They check that the local storage error appears as an `AlertBanner` and the save complete appears as a `Notice` (`role="status"`), and that there is a "다시 저장 재시도" button inside the save failure box.
- Existing: `routing.test.tsx`, which loads again with "다시 연결" after a connection error, still passes.
- `npm run test -w frontend -- src/components/alert-banner.test.tsx src/workout-draft.test.tsx src/routing.test.tsx src/custom-range.test.tsx`: at first 1 new test failed (saving closes the edit dialog, but it looked for the status inside the dialog). After I changed it to look in the whole screen, `workout-draft.test.tsx` has 20 pass. The other three files passed in the first run.
- `npm run test -w frontend -- --maxWorkers=1 src/set-completion.test.tsx src/routine-progress.test.tsx src/body.test.tsx`: 25 pass
- `npm run typecheck -w frontend`, eslint (`--max-warnings 0`) and prettier on the changed files: passed
- What I did not run: the free memory of the PC is about 0.9GB, so I did not run the whole frontend tests, the local full `npm run check`, or e2e. They are confirmed with the PR CI.

## Change — fix: first review fixes

The first review had no required comments and 5 recommendations. I applied 1 to 4, and I leave 5 because it is out of scope.

1. In the light theme, `text-destructive` text on `bg-destructive/10` was about 4:1, short of AA (4.5:1). The legacy `.error` has the same color, so it was not a regression, but I changed the text to `text-foreground` and kept the warning color only for the border, the 4px line on the left, and the background.
2. I made the "differences on screen" above match reality. I wrote the text size change from 12px to 14px and the change in the margin of each notice, and corrected that the corners are the same as before.
3. The usage example in the PR body would not compile as it was because of two sibling JSX elements and a comment at the end of a line. I split the example into two blocks.
4. The save failure test found the box with `/저장/` (save), so it could also match the save warning. I changed it to find it with the failure text ("입력은 화면에 유지됩니다" (the input stays on the screen)), and added a check that the retry button is `type="button"` and that pressing it saves again.
5. Left as it is: a `role="status"` or `role="alert"` that is newly mounted already holding text may not be read by some screen readers. The old code was the same, and the root fix is that the central `Notice` always mounts an empty region, which is a matter for `sirloinbh/project-standards`.

- After the fixes: `npm run test -w frontend -- --maxWorkers=1 src/components/alert-banner.test.tsx src/workout-draft.test.tsx src/routing.test.tsx` 27 pass, eslint and prettier on the changed files passed

## Change — test: update visual baselines

- The second review had no fixes. Two reviews are done, so there is no third review.
- At first I expected that these notices would not appear on the e2e fixed screens, but the save status "로컬 초안 · 서버 저장 전" (local draft · not saved to the server yet) appears at the top of the new record edit dialog. In the CI `e2e-visual` of `a2ea926`, only 4 of `workout-editor` 360, 390, 768, and 1280 failed, and the other 74 including axe, responsive, and touch passed.
- I looked directly at the baseline and actual images of `workout-editor-390`. Other than the save status text growing from 12px to 14px and a 12px margin below it that moved the content below down a little, there was no difference, so I updated 4 images with the `visual-baselines` artifact.
- Limit: the connection error, save warning, and save failure boxes do not appear on the e2e fixed screens, so they were checked only with screen tests.

## Change — merge: merge origin/main

- While waiting for CI, #225 (#103 backup screen) was merged to main and I merged `origin/main` (no rebase, no force push). There were no conflicts.
- #225 changed `backup.tsx`, `style.css`, and the `backup-*` baselines, and this branch changed `app.tsx` and the `workout-editor-*` baselines. The only overlapping file was `style.css`, and it merged automatically. The merge result is confirmed with CI again.
- After the merge: `npm run typecheck -w frontend` passed
