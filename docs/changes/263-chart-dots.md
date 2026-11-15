# #263 Trend chart dots look like ellipses on wide screens

## Problem

The SVGs of the running pace trend (`cardio/cardio-stats.tsx`) and the body records trend (`body.tsx`) stretch horizontally with `preserveAspectRatio="none"`. The `<circle r="3.5">` was stretched together, so at 1280px the dots became ellipses spread sideways.

## Change

- I added a shared `ChartDot` (`frontend/src/chart-dot.tsx`). It draws a dot as a `path` of length 0 with a round cap (`stroke-linecap: round`) and a stroke width of 7, with `vector-effect: non-scaling-stroke`.
- The line width is based on screen pixels, so even when the SVG stretches, the dot stays a circle with a diameter of 7px. It is the same size as the old `r="3.5"`.
- I changed the `<circle>` in both charts to `ChartDot`. The line (`polyline`), the coordinate calculation, the accessible name, and the `<title>` tooltip are the same.

## Checks

- `npm run test -w frontend -- src/cardio src/body`: passed
  - I added a check that the pace chart has no `circle` and that 2 dots use a non-scaling stroke.
  - The check of the number of body records trend dots counts `[data-slot="chart-dot"]`.
- Type check, ESLint, Prettier: passed
- Visual baselines: I updated `journal-cardio-1280` and `body-768`, which differed from the baseline in CI, with the result images. I confirmed in both images that the dots look like circles. The other widths are within the allowed range, so I leave them.

## Review

- First: nothing to fix. I confirmed that the round cap of a zero-length path is drawn as a circle by the SVG 2 spec, and that a non-scaling stroke is drawn in screen pixels even in a stretched SVG.
