# #315 Session notes for 2026-11-15 and 2026-11-16

- Issue: [#315](https://github.com/sirloinbh/workout-memo/issues/315)
- Branch: `docs/315-session-notes`

## Why

The latest daily log and next steps were from 2026-11-10, so a new session could not continue from the files (std-session-notes).

## Changes

- `docs/daily/2026-11-15.md`, `docs/daily/2026-11-16.md` (new, one file per workday as `docs/daily/README.md` says) and the README list. Merge times come from the GitHub PR list in Asia/Seoul time; issue states from the issue list.
- `docs/next-steps/README.md`: new priority table (#117 in progress, #312 decision, sign-in loading text, #260, #119 ②, #110/#111), user steps (including checking the 2026-11-16 deploys, which the agents could not do), and project-standards#594 as a follow-up. The removed rows (#105, #124, #173, #271, #109, #107) are closed.
- `docs/mobile-app.md`: the access, authentication and service worker rows said there was no HTTPS or login; since #106 (2026-11-15) and #303 (2026-11-16) the app is on `https://workout-memo.daysofme.com` behind the shared sign-in, so the service worker registers in production too.

## Checks

- `npm run format:check`, `npm run test:docs`: passed.
