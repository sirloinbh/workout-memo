# #101 Replace the workout record list with shared components (step 3)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-workout-list`

## Purpose

This is the third PR in #101, which moves one element at a time. The record list on the dashboard and the workout journal now uses `List`, `ListItem`, and `Button`, and the matching `style.css` rules are removed. This PR does not close #101.

## Change — feat: replace the record list

- `frontend/src/app.tsx`: the list becomes a list named `운동 기록` (workout records). The "수정" (edit) and delete buttons are the shared `Button`.
- `frontend/src/style.css`: removed the `.workout-list`, `.date-tile`, and `.row-volume` rules. `.workout-row`, `.workout-info`, `.text-button`, and `.icon-button` stay because other screens, such as machines and body records, still use them.
- The title, description, and volume text now use the shared tokens (`text-body-sm`, `text-meta`), so they grow from 9-13px to 12-14px. The set record text stays at 14px. The text of the "수정" button changes from the primary color to the foreground color.
- The date cell changes from 45×50px to 48×48px.

## Change — fix: first review follow-up

- Layout on narrow screens: the larger text narrowed the description column to 43-63px at 360px. Below 768px, the date and description go on the first line, and the volume and buttons go on the second line.
- Long text: I put back the `overflow-wrap: anywhere` that was lost when leaving `.workout-info`, now on the whole description column. This prevents the regression where a set note with no spaces overflowed the column and got cut off, and it also wraps long titles and exercise names that overflowed before.
- The overflow the reviewer caught is hidden by the `overflow: hidden` of `.card`, so the e2e overflow check does not catch it. jsdom cannot measure layout, so I did not add an automated test.

## Not done

The delete confirmation is still the browser's `confirm()`. Changing it to the shared `ConfirmDialog` changes the behavior and focus flow, and it should be looked at together with the goal and body record deletions, so I did not put it in this PR.

## Tests

- Added: the list name test and the row edit and delete button test in `frontend/src/period.test.tsx`
- Changed: the row selectors in `period.test.tsx` and `e2e/workout-crud.spec.ts` are separated from the removed styles and now use `data-slot`. The verified content is the same.
- `npm run typecheck`, `npm run lint`: pass
- Updated 8 visual baselines: the dashboard and journal at 4 widths. All 8 failures in the CI run were these visual regressions, and the other 70 checks, including axe, passed. I looked at `journal-360`, `journal-768`, and `dashboard-1280` directly.
- After the review follow-up, I did not measure the long note overflow again. The baseline screens have no such data, so I judged it only from the `overflow-wrap` being applied.
- I did not run the full local `npm run check` because it has a history of running out of memory. e2e is checked by PR CI.
