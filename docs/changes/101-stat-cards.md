# #101 Replace the stat cards with the shared Card (step 2)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-stat-cards`

## Purpose

This is the second PR in #101, which moves one element at a time. The stat cards on the dashboard and the workout journal now follow the shared `Card` standard, and the matching `style.css` rules are removed. This PR does not close #101.

## Change — feat: replace the stat cards

- `frontend/src/components/stat-card.tsx`: added `StatCard`, built on `Card`, and it replaces `Stat` in `app.tsx`.
- `frontend/src/app.tsx`: moved the layout of the card group to utility classes.
- `frontend/src/style.css`: removed the `.stats`, `.stat`, `.stat-top`, `.stat-value`, and `.stat-foot` rules, the responsive rules, and `.stat-top span` in the contrast rules.
- The font sizes now use the shared tokens (`text-caption`, `text-meta`, `text-2xl`, `text-3xl`), so the label and description get a little larger, and the big number gets a little smaller on narrow screens.
- Visual differences: the corners follow `Card`. The icon color becomes the foreground color, and the inner padding becomes 16px (20px from `xl`). The large gap and the large number apply from `xl` (1280px), not 1101px.

## Change — fix: first review follow-up

- With four columns at 768px with the sidebar, the card narrows to about 112px, and a long value (`1,234,567kg`) overlaps the next card. The shared Tailwind column is `minmax(0, 1fr)`, so the column does not grow as it did before.
- I raised the switch to four columns from 761px to `lg` (1024px). A 768px tablet now gets two columns. I added `break-words` to the value, so an even longer value wraps inside the card.
- I did not add an automated test. The e2e overflow check looks only at `scrollWidth`, so it cannot catch this overlap, and no e2e data produces a long value. The checks are the reviewer's static HTML measurement and the visual baselines.

## Tests

- Added: `frontend/src/components/stat-card.test.tsx`
- Changed: the selectors in 4 screen tests that look up stat values and in `e2e/workout-crud.spec.ts` now use `data-slot` instead of the removed classes. The verified content is the same.
- `npm run test -w frontend -- src/components/stat-card.test.tsx src/custom-range.test.tsx src/period.test.tsx src/set-completion.test.tsx src/workout-draft.test.tsx`: 54 pass
- `npm run typecheck`, `npm run lint`: pass
- Updated 12 visual baselines: the dashboard and journal at 4 widths (8 images), and 4 images of the journal edit modal with the cards visible behind it. All 12 failures in the first CI run were these visual regressions, and the other 66 checks, including axe, passed. I looked at `dashboard-360`, `dashboard-768`, and `dashboard-1280` directly.
- I did not run the full local `npm run check` because it has a history of running out of memory. e2e is checked by PR CI.
