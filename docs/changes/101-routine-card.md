# #101 Replace the routine goal card in the workout journal with the shared Card (step 8)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-routine-card`

## Purpose

This is the last PR in #101, which moves one element at a time. The routine goal card in the workout journal now uses the shared `Card`, `Button`, and utility classes, and the matching `style.css` rules are removed. This PR finishes the whole scope of #101. After the merge, I will compare the completion criteria and close the issue.

## Change — feat: replace the routine goal card

- `frontend/src/progress.tsx`
  - Card: `Card` (`role="region"`, name "루틴 목표" (routine goals)), `CardHeader`, `CardTitle` (h2), `CardDescription`, `CardContent`. The region name is the same as the old `<section aria-label>`.
  - Buttons: "오늘 루틴으로 기록하기" (record with today's routine) is `secondary`, "오늘 하루 휴식하기" (rest today) is `ghost`, "휴식 확정" (confirm rest) is the default, "돌아가기" (go back) and "휴식 취소" (cancel rest) are `outline`, and "루틴 목표 다시 불러오기" (reload routine goals) is `link`.
  - Error: uses `destructive` token utilities (`border-destructive/30`, `bg-destructive/10`, `text-destructive`) instead of `.error`.
  - Auto goal notice: `bg-muted` and `text-meta` instead of `.form-hint`.
  - 12-week table: moved the cell borders and padding to utilities. On narrow screens only the table scrolls horizontally, as before. Before, the table itself was switched to `display: block`; now the table is wrapped in an `overflow-x-auto` box.
  - Markers used by tests: the goal list is `data-slot="target-list"`, and an excluded goal is `data-excluded`.
- `frontend/src/style.css`: removed `.routine-progress`, `.progress-body`, `.target-list`, `.progress-actions`, `.rest-preview`, `.week-table`, the responsive rules, and the `.rest-preview` in the contrast rules. I also removed one `@media (max-width: 760px)` block that became empty.
- Visual differences: buttons take the shared `Button` look (36px high, 44px on touch devices). Body text grows from 12 to 13px up to 14px, and the title from 15px to 16px. The confirm rest and go back buttons sit on one line with a gap.

## Tests

- Changed: the list selectors in `frontend/src/routine-progress.test.tsx` (`className === 'target-list'`, `className === 'excluded'`) now use `data-slot` and `data-excluded`. The verified content is the same.
- Added: 2 tests in the same file
  - When loading fails, an error shows inside the card, and "루틴 목표 다시 불러오기" requests again so that the card returns to normal.
  - Pressing "돌아가기" in the rest preview closes the preview without a request, and "오늘 하루 휴식하기" shows again.
- `npm run test -w frontend -- src/routine-progress.test.tsx`: 9 pass
- `npm run test -w frontend`: 209 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: pass
- Visual baselines and e2e (responsive, axe) are checked by PR CI. I did not run the full local `npm run check` because it has a history of running out of memory.

## Change — fix: first review follow-up

- The horizontal scroll box of the 12-week table could not be entered with the keyboard. When the table overflows at 360px, keyboard users cannot scroll it, and it could also fail the axe rule `scrollable-region-focusable`. The old `display: block` table had the same problem. I gave the box `role="region"`, the name "12주 전체 목표 표" (full 12-week goal table), `tabIndex={0}`, and a focus border (`ring-ring`). The lint rule `no-noninteractive-tabindex` is turned off on this one line only, with the reason written.
- The load failure test was tied to how many times it loads on each page change (`failProgress: 2`). I replaced it with a flag that keeps failing until recovery and `recoverProgress()`. The same test also checks that the table box is focusable (`tabindex="0"`) and that all 12 weeks are there.
- Not applied: the comment that "the contrast of faded text on a gray background is 4.35:1, below AA". That number is for light mode. This app is dark only, and the contrast of `muted-foreground` on the dark `muted` background is about 5.8:1. I will check with the axe check in CI.
- After the first follow-up: `npm run test -w frontend -- src/routine-progress.test.tsx` 9 pass, `npm run lint` and `npm run typecheck -w frontend` pass

## Change — test: update visual baselines

- The second review had no follow-up items. I only fixed an optional wording in the record above ("포커스를 받고" (receives focus) to "포커스 가능" (focusable)). Two reviews are done, so there is no third review.
- In the `e2e-visual` CI run for `3faa074`, only 4 images failed, `journal-360·390·768·1280`, and the other 74 checks, including axe and responsive, passed. I looked at the 360px and 1280px images directly and confirmed there is no difference other than the larger description and body text. Then I updated the 4 images from the `visual-baselines` artifact.
- Limitation: today in the fixed e2e data (2026-10-15) is not a planned workout day, so the "오늘 루틴으로 기록하기", "오늘 하루 휴식하기", and rest preview buttons do not appear in the baseline images. Only screen tests cover these buttons.
