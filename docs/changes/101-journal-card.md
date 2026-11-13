# #101 Replace the workout record card frame and the local draft notice with shared components (step 9)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-journal-card`

## Purpose

After step 8, I compared the remaining work against the #101 completion criteria. Two places are left. One is the workout record card frame on the dashboard and the workout journal (step 3 moved only the list rows). The other is the local draft recovery notice on the dashboard. When this PR is merged, I will compare the #101 completion criteria again and close it.

## Change — feat: replace the card frame and the draft notice

- `frontend/src/app.tsx`
  - Workout record card: replaced `.card journal-card` and `.section-title` with `Card`, `CardHeader`, `CardTitle` (h2), `CardDescription`, and `CardAction`. The count is a `Badge` (`secondary`) instead of `.count`, and "전체 기록" (all records) is the shared `Button` (`ghost`, `sm`).
  - Empty state: replaced `.empty` with the shared `EmptyState` (h3, icon, description, and a "운동 기록하기" (record a workout) `Button`). The loading text is a utility paragraph.
  - Local draft notice: replaced `section.card` with `Card` (`role="region"`, name "로컬 초안" (local draft)), and replaced "초안 복구" (restore draft) and "초안 폐기" (discard draft) with `Button` (`secondary`, `ghost`). From `md` up, the text and the buttons sit on one line.
- `frontend/src/style.css`: no rules were removed. `.card`, `.section-title`, `.count`, `.empty`, `.subtle-button`, and `.text-button` are still used by screens in the scope of #102 and #103, such as exercise analysis, body records, my goals, and the machine library. `.journal-card` had no rule to begin with.
- Visual differences: the count looks like a `Badge`, and the empty state sits in a dashed-border box. The description text gets larger. The draft notice used to have the text and the buttons stuck together with no inner padding; now it has padding and a gap between buttons.

## Tests

- Added: 1 test in `frontend/src/period.test.tsx`. It checks that the title reads "운동 기록 2" (workout records 2) including the count, that "전체 기록" on the dashboard goes to the workout journal and disappears there, and that an empty period shows "운동 기록 0" and the empty state, where "운동 기록하기" opens the new record window.
- Existing: the draft restore and discard buttons are pressed by role and name in `workout-draft.test.tsx` and others, so they still pass.
- `npm run test -w frontend -- src/period.test.tsx`: 25 pass
- `npm run test -w frontend`: 210 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: pass
- Visual baselines and e2e (responsive, axe) are checked by PR CI. I did not run the full local `npm run check` because it has a history of running out of memory.

## Change — fix: first review follow-up

- The `data-slot="journal-card"` added to the card overrode the `data-slot="card"` of `Card`, so a shared selector used later could skip only this card. Nothing used it, so I removed it.
- The `text-meta` on the count `Badge` set the `muted-foreground` color along with the font size, which clashed with the `text-secondary-foreground` of `Badge`. I changed it to `text-xs`, which sets only the size.
- The required item the reviewer raised, "visual baselines not updated", is handled as this repo's procedure says: update them after checking the CI images.
- After the first follow-up: `npm run test -w frontend -- src/period.test.tsx` 25 pass, `npm run lint` and `npm run typecheck -w frontend` pass

## Change — test: update visual baselines

- The second review had no follow-up items. Two reviews are done, so there is no third review.
- In the `e2e-visual` CI run for `4b54494`, only 9 checks failed, and the other 69, including axe, responsive, and touch, passed. The changes were `dashboard` and `journal` at 360, 390, 768, and 1280, and `workout-editor-768`, which shows the dashboard behind it. I looked at `dashboard-1280` and `journal-360` directly and confirmed there is no difference other than the count `Badge`, the larger description text, and the "전체 기록" button. Then I updated the 9 images from the `visual-baselines` artifact.
- Limitation: the fixed e2e data has records and no local draft, so the empty state and the draft notice do not appear in the baseline images. Only the screen tests (`period.test.tsx`, `workout-draft.test.tsx`) cover them.
