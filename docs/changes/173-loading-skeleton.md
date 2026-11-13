# #173 Switch the loading display to the shared Skeleton and Spinner

- Issue: [#173](https://github.com/sirloinbh/workout-memo/issues/173)
- Branch: `feat/173-loading-skeleton`
- Rule: sirloinbh/project-standards `docs/ui-components.md` "불러오는 중 화면" (loading screen) (project-standards#312)

## Purpose

The feature screens showed only the text "불러오는 중…" (loading…), and nowhere used the shared `Skeleton` and `Spinner`. Lists and cards loaded for the first time are changed to placeholders with the real shape, and buttons waiting for a save are changed to a small spinner.

## Change — feat: placeholders and save spinners

- While loading for the first time (`aria-busy="true"` region):
  - Exercise analysis: a shape of 2 cards (`SkeletonCard`). When it is loaded again after a range change, the cards that already exist are left as they are, and a small spinner and "분석 불러오는 중…" (loading analysis…) are shown below the range line.
  - Body records list: a list row shape (`SkeletonList`). When it is loaded again while it has records (after a range change, save, or delete), the list is left as it is and the status sentence is given only for screen readers.
  - Saved routines in the routine builder: 2 list rows (`SkeletonList rows={2}`). When it is loaded again after a save, there is no loading display (the original behavior).
  - In all three places, the placeholder region gets a name (`aria-label`: exercise analysis, body records list, saved routines), and the "…불러오는 중…" sentence is put inside it for screen readers only (`sr-only`, `role="status"`). The placeholder is `aria-hidden`.
- Buttons waiting for a save (already `disabled`): `Spinner size="sm"` is placed before the text. The button name stays the text, so the spinner is `aria-hidden`.
  - Save body record, save routine, save body part of exercise analysis, save goal, save machine, save the increment unit of the next goal suggestion, and run backup restore
- The shared parts (`components/ui/**`) were not changed.

## What is left (out of the scope of this PR)

- The workout record list "기록을 불러오는 중…" (loading records…) of the workout log and the dashboard (`app.tsx`), the routine goal card "루틴 목표를 불러오는 중…" (loading routine goals…) of the workout log (`progress.tsx`), the routine goal rest confirm "처리 중…" (processing…) button (`progress.tsx`), and the "저장 중…" (saving…) button and the save status line of the workout record edit dialog (`app.tsx`). The log screen and the edit dialog are being worked on in #105, so I change them after that.
- The backup restore and check status lines and the InBody photo reading status line themselves are not first loads but progress notes of an operation, so I left them as text status lines.

## First review

- Required: the placeholder regions had no name (the rule is `aria-busy` and `aria-label`). I gave the three regions names and moved the routine builder status sentence into the region.
- Applied (optional): in body records, when it was loaded again the list changed to a placeholder, which flickered and lost focus. The placeholder is now used only the first time. In exercise analysis, no visible indicator was left while it was loaded again, so I made a spinner and a sentence visible. I also put a spinner in the increment unit save and restore run buttons. The tests check `aria-hidden="true"` and the region names. I corrected the description of loading the routines again to the real behavior.

## Tests

- Added: `frontend/src/loading-placeholders.test.tsx`
  - Exercise analysis, body records, routine builder: while the first response is held, the `aria-busy` region has a placeholder, the status sentence is `sr-only`, the placeholder is `aria-hidden`, and all of them disappear after the response (3 tests)
  - While the body record save is held, the button is off as "저장 중…" (saving…) and has a spinner (1 test)
- `npm run test -w frontend`: 42 tests in the 8 related files, and 4 in the new file passed. After the first review fixes, 47 tests in 9 files including the new file passed. `npm run typecheck -w frontend`, eslint and prettier (changed files) passed.
- The visual baselines are screens after loading, so I expect them not to change. The status sentence of the routine builder is drawn only while loading.
- The PC is low on memory, so I did not run the full local `npm run check` and e2e; they are confirmed with CI.
