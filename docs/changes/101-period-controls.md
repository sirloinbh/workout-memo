# #101 Replace the period tabs with SegmentedControl (step 1)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-period-feedback-controls`

## Purpose

#101 replaces the dashboard, the journal, and the journal editor with the shared standard. `Workspace` is a single component of 1,500 lines, and merging to main is a production deploy, so the work is split into small steps. This PR is step 1 and does not close #101.

## Change — feat: replace the period tabs

- `frontend/src/app.tsx`: the period tabs on the dashboard, the workout journal, and body records are now `SegmentedControl`.
- `frontend/src/analysis.tsx`: the week tabs in exercise analysis also use the same component. This is in the scope of #102, but it is the same `.tabs` element, so I moved it together.
- Behavior change: the tabs become radio groups (`기간` (period), `분석 기간` (analysis period)) instead of buttons. Pressing the already selected "직접 선택" (custom range) again does not clear the start and end dates being typed.
- The feeling feedback is left as it is. Pressing it again clears it, which does not fit `SegmentedControl`, where one value is always selected.
- The `.tabs` rules are not removed because the feeling feedback still uses them.

## Change — fix: first review follow-up

- Regression fix: the old behavior of cleaning up the URL when you opened a bad period URL (`?from=bad&to=bad`) and pressed the current tab was lost in the replacement. I added `onReselect` to `SegmentedControl` to restore it, and added a regression test.

## Change — docs: second review follow-up

- The second review found no functional defects. I added `onReselect` to the `SegmentedControl` comment and to `docs/design-system.md`, and noted that it is not used for the feeling feedback. Reviews stop at two, so I did no more.

## Tests

- I changed the screen tests and e2e that look up the period tabs from `button` to `radio`, and the `selected` class check to `toBeChecked()`. They verify the same meaning.
- `npm run test -w frontend`: 195 pass, 2 fail, 4 skip. The 2 failures are 5-second timeouts in `routines.test.tsx`. When that file runs alone, all 8 pass. Those tests do not use the period tabs, and I think the cause is the load of a full run on this PC. I will check again in CI.
- `npm run typecheck`, `npm run lint`: pass
- Updated 19 visual baselines: the dashboard, journal, exercise analysis, and body records at 4 widths (16 images), and 3 images of the journal edit modal with the tabs visible behind it. All 19 failures in the first CI run were these visual regressions, and the other 59 checks, including axe, passed. I looked at `dashboard-360` and `body-768` directly.
