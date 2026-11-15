# #103 Replace the machine library list with shared components (step 2)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-machine-list`

## Purpose

This is the second PR in moving #103 over one element at a time. After step 1 (backup and export, #225), move the brand tabs and the list of the machine library. The page header and the "머신 등록" ("register machine") button are in the scope of #222, so they are not touched. The remaining steps are the machine create and edit form and the official reference values, the body record trend and record form, the InBody import preview table, and the final `style.css` cleanup.

## Change — feat: replace the machine list

- `frontend/src/app.tsx`
  - Brand tabs: replaced the `.brand-tabs` button row with a `SegmentedControl` (name "브랜드", "brand"). One is always selected, so it matches the use of the design system's `SegmentedControl`. The selected state is announced with `aria-checked`, and pressing the current tab again does not unselect it.
  - List card: replaced `section.card` and `.section-title` with the same `Card`, `CardHeader`, `CardTitle` (h2), and `CardDescription` as the workout record card (#101).
  - Empty state: replaced `.empty` with the shared `EmptyState` (h3, icon, description).
  - Rows: replaced `.workout-row`, `.machine-icon`, and `.workout-info` with `List` (name "머신", "machines"), `ListItem` (`data-slot="machine-row"`), and utilities. The icon box is 48px, the same as the date box in the workout record row. The official reference value line and the "출처" ("source") link are utility text and an underlined link.
  - "수정" ("edit") changed from `.text-button` to the shared `Button` (`ghost`, `sm`). The name is unchanged.
- `frontend/src/style.css`: removed `.brand-tabs`, `.brand-tabs button`, `.brand-tabs .selected`, and `.machine-icon`, and took `.machine-icon` out of the contrast rule list at the end. `.official-ref` stays because the create and edit form (step 3) still uses it. `.card`, `.section-title`, `.empty`, `.text-button`, `.workout-row`, and `.workout-info` are still used by exercise analysis and body records.
- Screen difference: the brand tabs go from a row of bordered buttons to a tab group on a gray background, and the list rows get the same spacing and text size as the workout record rows.

## Tests

- Added: 1 test in `frontend/src/official-weights.test.tsx`. It checks that "전체 브랜드" ("all brands") is selected at first, that choosing a brand selects only that tab ("전체 브랜드" is unselected) and the empty state (h3) shows when there are no machines, that choosing a brand with machines keeps those machines, that pressing the current tab again keeps the selection, and that going back to "전체 브랜드" shows the list again.
- Changed: in the same file and `machines.contract.test.tsx`, the `.workout-row` selector now uses `data-slot="machine-row"` and the "머신" ("machines") list role, and the brand button lookup uses the `radio` role. What is verified is the same.
- `npm run test -w frontend -- src/official-weights.test.tsx src/machines.contract.test.tsx src/forms.test.tsx src/rest-by-exercise.test.tsx src/routing.test.tsx`: 23 pass
- `npm run typecheck -w frontend`, eslint (changed files), prettier: pass
- The full local `npm run check` and e2e were not run because there is a history of running out of memory. e2e (responsive, axe, touch, visual baselines) is checked by the PR CI.

## Change — test: first review follow-up

- The first review had no required follow-ups, and 2 optional ones were applied.
  - The new test picked only a brand with no machines, so it could pass even if the comparison of the tab value (a string) and the brand id (a number) broke. Added a step that picks "Hammer Strength", which has machines, and checks that its machines remain.
  - It also checks that choosing a brand unselects "전체 브랜드" ("all brands").
- `npm run test -w frontend -- src/official-weights.test.tsx`: 7 pass

## Change — test: update visual baselines

- The second review had no follow-ups. Two reviews are done, so there is no third review.
- In CI `e2e-visual` for `42b6331`, only 6 visual comparisons failed, and 72, including axe, responsive, and touch, passed. The ones that changed are `machines` 360, 390, 768, 1280 and `machine-editor` 768 and 1280, which show the machine list behind the modal. `machines-360`, `machines-1280`, and `machine-editor-1280` were viewed directly and showed no difference apart from the brand tab group, the list row spacing and text, and the background behind the modal. The modal itself is unchanged. After that the 6 images were updated with the `visual-baselines` artifact. The other images were byte-for-byte the same as the existing baselines.
- Limitation: the machines in the e2e fixed data have no official reference values linked, so the official reference value line, the "출처" ("source") link, and the empty state do not appear in the images. They were checked only with the screen tests (`official-weights.test.tsx`).

## Merge main

- Just before the merge, main was ahead by #229 (#223 app top alerts), so `origin/main` was merged. There were no conflicts. After the merge, `npm run test -w frontend -- src/official-weights.test.tsx src/machines.contract.test.tsx` gave 8 pass and `npm run typecheck -w frontend` passed.
