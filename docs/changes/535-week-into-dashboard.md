# #535 Merge Week and 12 weeks into Dashboard

- Issue: [#535](https://github.com/sirloinbh/workout-memo/issues/535) (tracking: sirloinbh/project-standards#1215)

## Changes — 2026-11-28

- The Week and 12 weeks menu items are removed. Dashboard already has the period choice (1 week, 12 weeks), so it shows both views.
- `/week` redirects to `/dashboard`; `/12-weeks` redirects to `/dashboard?period=12weeks` (the dashboard reads `?period=` as its starting period). Other query parameters are kept.
- Tests: `routing.test.tsx` checks the menu and both redirects; `journal-tab.test.tsx` opens the journal and picks 1 week instead of mounting `/week`; `/week` and `/12-weeks` are dropped from the `layout.spec.ts` page list (they redirect to a listed page).
