# #508 Settings page

## What changed

- New page `/settings` ("Settings", the last menu item) with three cards:
  - **Rest timer:** rest time, auto-start when a set is done, default rest by exercise type (`TimerSettings`, moved out of the workout editor).
  - **Notifications:** the rest-end push switch (`RestPushToggle`, split out of `TimerSettings`) and the weekly summary switch (moved off the dashboard).
  - **Data:** links to Backup & Export and the Machine Library.
- The workout editor keeps the timer bar and shows a "Rest settings" link. The link closes the editor (the local draft is kept and offered for restore) and opens `/settings`.
- Backup & Export and the Machine Library leave the main menu (9 items now). `/backup` and `/machines` keep working at the same addresses.
- The dashboard no longer shows the weekly summary switch.

## User decisions (2026-11-27, issue comment)

1. Rest settings move to Settings; the editor keeps the timer bar plus a link.
2. Theme: Settings only. This app is dark-only (`DARK_ONLY`, #184), so the header has no theme switch and there is nothing to move; no Appearance section was added.
3. Per-exercise weight steps stay in routines and the goal form.
4. Backup & Export and Machines move under Settings; old URLs still work.

## Tests

- New `settings.test.tsx` (sections, storage of a changed value, dashboard has no weekly switch); `routing.test.tsx` (Settings is last, old addresses work).
- Existing rest, push, backup, machine and routing tests now reach those controls through Settings (`test/nav.ts`: `openFromSettings`, `enableAutoStart`).
- e2e: `/settings` added to the overflow and axe/visual page lists; menu link count 9. Local e2e was not run here; the CI `e2e` and `e2e-visual` jobs check it.

## Screenshot baselines

The menu changes on every screen, so baselines are refreshed from the CI `visual-baselines` artifact (26 files updated, 4 new `settings-*.png`): the menu changed on the 768 and 1280 screens, and the workout editor shows the "Rest settings" link instead of the settings block.
