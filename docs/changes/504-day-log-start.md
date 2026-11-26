# #504 Open on the day log and use the shared menu order

- Issue: https://github.com/sirloinbh/workout-memo/issues/504
- Branch: feat/504-day-log-start

## Changes

- The day log (the journal page) is the start page at `/`. The old `/journal` address redirects to `/` and keeps its query, so `?tab=cardio` and `?from=&to=` links still work. An unknown address falls back to `/` too.
- New views of the same records over a longer period: Week (`/week`) and 12 weeks (`/12-weeks`). Each opens on its own period; a preset chosen on a log page stays on that page.
- The dashboard moved to `/dashboard`.
- Menu order: Day log, Week, 12 weeks, Routine and goal pages (My Goals, Exercise Analysis, Routine Builder, Body records, Machine Library), Dashboard, Backup & Export last (this app has no separate Settings page; #508 adds one and keeps Settings last).
- Tests: the unit tests keep a dashboard start (`/dashboard`) in their setup; new tests cover the start page, the redirect and the two views; e2e specs use the new menu name and count (10 links) and cover the new addresses.

## Verification

- `npm run check` (see the PR for the result). e2e needs the database and runs in CI.
