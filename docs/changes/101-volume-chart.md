# #101 Replace the dashboard chart area with the shared Card (step 7)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-volume-chart`

## Purpose

This is the seventh PR in #101, which moves one element at a time. The chart area on the dashboard (the training volume card and the notice card beside it) now uses the shared `Card` and utility classes, and the matching `style.css` rules are removed. The remaining scope is the routine goal card in the workout journal. This PR does not close #101.

## Change — feat: replace the chart area

- `frontend/src/app.tsx`
  - Training volume card: now `Card`, `CardHeader`, `CardTitle` (h2), `CardDescription`, and `CardAction` (legend).
  - Notice card (THE NEXT CHAPTER): built on `Card` with `bg-muted`, and "나의 목표 확인하기" (check my goals) is the shared `Button` (`link`). The decorative circles are `aria-hidden`.
  - `Chart`: bar height changes from pixels based on a fixed 145px to a % of the chart height. The bar color is `bg-foreground/20`, the last period is `bg-primary`, and the corners are `rounded-t-sm`. The axis and date text are `text-meta` (12px).
  - When there are more than 7 bars (12 weeks, or a custom range of 8 days or more), the date labels are thinned out. 1 week (7 weekdays), 4 weeks (4), and 1 month (5) show all of them. The rule was changed in the first review follow-up below.
  - Card layout: 1 column → `md` 230px → `xl` 280px → `2xl` 340px for the right column. Before, it changed at 761px, 1101px, and 1500px.
- `frontend/src/style.css`: removed `.overview-grid`, `.legend`, `.chart`, `.chart-y`, `.plot`, `.grid-lines`, `.bars`, `.bar-column`, `.bar`, `.chart-empty`, `.focus-card`, `.focus-top`, `.rings`, the responsive rules, and `.focus-card` in the contrast rules. I also removed the `@media (min-width: 1500px)` block that became empty. `.card` and `.section-title` stay because other screens use them.
- Visual differences: the title grows 15→16px, the description 10→14px, and the legend, axis, and dates 8-9px→12px. The chart height is 215px→224px (256px at `2xl`). On mobile, the notice card description goes under the title instead of sitting over the top right. Because `.focus-card` was removed from the contrast rules, "THE NEXT CHAPTER" and the description in the notice card get a little fainter in the `muted-foreground` color. The contrast on the dark `muted` background is about 5.8:1, above AA.

## Change — fix: first review follow-up

- Bar column overflow (must-fix): the column is `flex-1` without `min-w-0`, so the minimum column width became the date label width (about 30px). At 768px with the sidebar and the right column, choosing 12 weeks needs more than 300px in a chart about 130px wide, so the bars cover the notice card. The same happens at 360px and with a 31-day custom range.
  - I added `min-w-0` to the column, and the label is placed in the center of the column with `absolute`, so it no longer counts in the column width calculation. I cut the minimum bar width from 6px to 2px.
  - The label thinning and the bar gap are now decided by the chart's own width (container query), not the screen width (`xl`). The sidebar makes the two widths move separately. Labels show as follows: one in 4 always, one in 2 from a 200px chart, and all from 480px (changed in the second review follow-up). The gap is 1px → `@sm` 4px → `@lg` 10px.
- Record fix: I wrongly wrote that the thinning applies to "4 weeks, 1 month, 12 weeks, and custom range". 4 weeks has 4 and 1 month has 5, so they are not thinned.
- Notice card title: between `md` and `xl`, where the right column is 230px, I used `md:text-xl xl:text-2xl` so the 24px title does not wrap onto more lines (it was 22px before).
- A test that was tied to the markup structure (`parentElement.nextElementSibling`) now finds the label by `data-slot="volume-label"`.
- Not applied: adding a visual baseline with 12 weeks chosen at 768px. That widens the scope of the fixed-data e2e, so I did not put it in this PR. The overflow is prevented by the structure change above and the screen tests.

## Tests

- Added: `frontend/src/period.test.tsx`
  - Checks that the bar height is a % of the largest period, that only the last period is highlighted, and that the empty notice is not shown when there are records.
  - Checks that 1 week shows all 7 labels, and that the 12 labels for 12 weeks split into the always, 200px, and 480px steps (changed in the first review follow-up).
- Added: `frontend/src/custom-range.test.tsx` — checks that a 31-day custom range puts a label every 3 days and splits into the same steps (first review follow-up).
- First commit: `npm run test -w frontend -- src/period.test.tsx src/custom-range.test.tsx` 29 pass
- After the first follow-up: the same command 30 pass, `npm run test -w frontend` 207 pass and 4 skip, and `npm run build -w frontend` confirmed that the container query classes (`@min-[200px]`, `@min-[400px]`, `@sm`, `@lg`) are generated in the CSS
- First commit: `npm run test -w frontend` 206 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: pass
- Visual baselines and e2e (responsive, axe) are checked by PR CI. I did not run the full local `npm run check` because it has a history of running out of memory.

## Change — fix: second review follow-up

- I raised the threshold for showing all labels from a 400px chart to 480px. Near 400px, the 12 five-character labels (for example `12/29`, about 33px) touched with a gap under 1px or overlapped slightly.
- I split the test result lines of this record by commit.
- Not applied: the comment that "the legend, y axis, dates, empty notice, and THE NEXT CHAPTER lost the faded text color". The `text-meta` and `text-caption` utilities of the shared tokens also set `color: var(--color-muted-foreground)`, so the color is already faded (`@sirloinbh/design-tokens/tailwind.css`).
- Reviews stop at two, so there is no third review.
- After the second follow-up: `npm run test -w frontend -- src/period.test.tsx src/custom-range.test.tsx` 30 pass, `npm run lint`, `npm run typecheck -w frontend`, and prettier pass, and I confirmed that `@container (min-width:480px)` is generated in the built CSS

## Change — fix: notice card link button padding

- I found this while looking at the CI visual baseline images. "나의 목표 확인하기" sat about 12px further in than the sentence above it, because the `has-[>svg]:px-3` of the shared `Button` beat `px-0`. I added `has-[>svg]:px-0` so it lines up with the sentence on the left as before.
- Updated 7 visual baselines: in the `e2e-visual` CI run for `ee165c2`, only 7 checks failed, and the other 71, including axe and responsive, passed. The changes were `dashboard-360·390·768·1280` and `workout-editor-360·768·1280`, which shows the dashboard behind it. I looked at `dashboard-360·768·1280` directly and confirmed that the larger text, the legend position, the notice card layout, and the left alignment of the link are as intended. The other 37 images are unchanged.
