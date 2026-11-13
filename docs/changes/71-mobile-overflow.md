# #71 Fix the mobile horizontal overflow

- Issue: [#71](https://github.com/sirloinbh/workout-memo/issues/71) (found during the #66 screen sameness verification)
- Branch: `fix/71-mobile-overflow`

## Cause — 2026-10-20

In real Chrome, I collected the elements that go outside the right edge of the viewport (a temporary spec, not committed).

- **390px**: all 8 pages had `scrollWidth=424`.
  - The mobile menu puts 8 links on one line (`flex: 1`), but adding each link's minimum width (about 47px) and the gaps needs about 404px. The usable width is 354px, so the last link was pushed out to 424px.
  - The labels were also split vertically (for example "머신 / 라이브러리" (Machine / Library)).
- **320px**: the dashboard, journal, and body records had `scrollWidth=373`. The period tabs and the date controls sit on one line, so the date controls were pushed out.
- The decorative circles (`.rings`) on the dashboard were clipped by the `overflow: hidden` of the parent `.focus-card`, so they did not affect the scroll width.

## Change

I changed only inside the `@media (max-width: 760px)` of `frontend/src/style.css`. The desktop rules are unchanged.

- Menu: a 4-column grid (`repeat(4, minmax(0, 1fr))`), 2 rows. The links put the icon on top and the label below, with `min-width: 0` and centered alignment.
- Period bar: `flex-wrap: wrap`. At narrow widths, the date controls drop to the line below the tabs.
- `e2e/layout.spec.ts` (new): at 320px and 390px, it checks that the `scrollWidth` of the 8 pages is at most the viewport width, and that all 8 menu links are inside the viewport.

## Checks

| Check                                                                                           | Result                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scrollWidth` after the change                                                                  | All 8 pages at 390px are 390, and all 8 pages at 320px are 320                                                                                                                                                                 |
| `npm run test:e2e`                                                                              | **4 passed**: layout 320 and 390, journal CRUD, URL persistence                                                                                                                                                                |
| Desktop 1280px pixel comparison (main `style.css` against the change, clock fixed, animations off) | **0 pixels of difference** on the 8 pages                                                                                                                                                                                  |
| Mobile screen check                                                                             | Before the change, the menu labels were split vertically, the last link was cut off, and the period tab text was split vertically. After the change, the menu is 4 columns by 2 rows, the labels are on one line, and the period tabs are on one line |

`npm run check`: **EXIT=0**. Result: backend 279, frontend 89, workers 212, skills 4, all pass, with 0 fail and 0 skip.
