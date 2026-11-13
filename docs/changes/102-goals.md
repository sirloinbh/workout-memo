# #102 Replace the My goals screen with shared components (step 1)

- Issue: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- Branch: `feat/102-goals`

## Purpose

This is the first PR in moving #102 over screen by screen. Replace the goal list, the add-goal form, and the next-goal suggestion of My goals with the shared `Card`, `Badge`, `EmptyState`, `Button`, `Label`, and `Input` and utility classes. Delete the `style.css` rules that only this screen used. The next steps are exercise analysis (step 2), the routine form (step 3), and the 12-week preview and plan view (step 4).

## Change — feat: replace My goals

- `frontend/src/app.tsx`
  - Goal list: each goal is a `Card`, and the exercise name is a `CardTitle` (h2). It is 2 columns on PC (768px and wider) and 1 column when narrower. The old breakpoint was 760px.
  - Status display: changed to `Badge`. Achieved is `success`, period ended is `warning`, and in progress is `outline`. Before, only achieved had a green background, and the other two shared the same yellow background.
  - Goal delete: a `Button` (`link`) named "<exercise name> 목표 삭제" ("delete <exercise name> goal"). With several goals there used to be several buttons with the same name. The confirmation before deleting is still `confirm`.
  - Empty state: `EmptyState` (h2). Before, an h3 came right after the h1, so a heading level was skipped. The empty state has no button so its name does not clash with the "목표 추가" ("add goal") button in the header.
  - Goal form: inputs are the shared `Input` and labels are the shared `Label`. The 2-column layout moved to utilities, and on touch devices at 480px and below it is 1 column as before. The hint text uses `bg-muted` and `text-meta` instead of `.form-hint`.
  - Next-goal suggestion: the bordered box and the increment unit row moved to utilities. "제안 적용" ("apply suggestion") is size `sm`.
  - Goal cards have no separate `data-slot`. This avoids overwriting the `data-slot="card"` of `Card`, as in #101.
- `frontend/src/style.css`: removed `.goal-grid` (including the responsive rule), `.goal-card`, `.goal-card p`, `.badge`, `.badge.success`, `.goal-number`, `.goal-suggestion`, `.goal-step`, and `.modal .goal-step label`. `.card`, `.empty`, `.text-button`, `.form-grid`, `.form-hint`, `.modal label`, and `.field-error` stay because other screens use them too.
- The `Input` of the app-specific `components/field` is no longer used by screens. `modal.test.tsx` uses it, so it was left as is.

## Tests

- Added: 4 tests in `frontend/src/goal-list.test.tsx`
  - Check that each goal card shows the status badge (in progress, period ended, achieved), the target weight x reps, the period, and the hint text.
  - Check that confirming a delete removes only that goal with `DELETE /api/goals/:id` and the card disappears, and that cancelling sends no request.
  - Check that the empty state hint shows when there are no goals.
- Existing: `goal-suggestion.test.tsx` (apply suggestion, save increment unit) and `forms.test.tsx` (goal form error text) pass without edits.
- `npm run test -w frontend -- src/goal-list.test.tsx src/goal-suggestion.test.tsx src/forms.test.tsx`: 9 pass
- `npm run test -w frontend`: 214 pass, 4 skip
- `npm run typecheck -w frontend`, eslint and prettier (changed files): pass
- Visual baselines and e2e (responsive and axe) are checked by the PR CI. Three worktrees ran at the same time and there is a history of running out of memory, so the full local `npm run check` and e2e were not run.

## Change — fix: first review follow-up

- The shared `Input` has 14px text (`md:text-body-sm`) at 768px and wider, and the 16px touch rule in `style.css` is in the components layer, so it cannot beat this utility. In the goal form at touch 768px the `ui-touch` check (violation for under 16px) failed, and iPad could zoom in on input. Added the same `md:pointer-coarse:text-base` as the workout record form to the 5 goal form inputs and the increment unit input.
- The empty state test now also checks the heading level (h2).
- Not applied: the remark (nit) that `leading-none` of the shared `Label` overlaps the line height of `text-meta`. The label is one line, so there is no visible difference, and the baseline images confirm it.
- Visual baselines: the 8 goals and goal-editor baselines are expected to change. After checking the CI `e2e-visual` result images, update them with the `visual-baselines` artifact.
- After the first follow-up: `npm run test -w frontend -- src/goal-list.test.tsx src/goal-suggestion.test.tsx src/forms.test.tsx` 9 pass, eslint and `npm run typecheck -w frontend` pass

## Change — test: update visual baselines

- The second review had no follow-ups. Confirmed that the whole first follow-up (6 touch 16px inputs, empty state h2 check) went in. Two reviews are done, so there is no third review.
- In CI `e2e-visual` for `3b9a70d`, only the 8 images `goals-360·390·768·1280` and `goal-editor-360·390·768·1280` failed, and the other 70, including axe and responsive, passed.
- The 1280px and 360px goals screen and the 390px add-goal window were compared side by side with the old baselines. Apart from the status badge look (outlined for in progress, green for achieved), the text size inside cards (11px to 14px), and the input text size, there is no layout difference or overflow, so the 8 images were updated with the `visual-baselines` artifact.
