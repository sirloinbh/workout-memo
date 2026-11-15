# #112 Mobile UI/UX task tests and finding improvements

- Issue: [#112](https://github.com/sirloinbh/workout-memo/issues/112)
- Branch: `research/112-ux-audit`
- Summary card: step 1 of the confirmed work order in [#122](https://github.com/sirloinbh/workout-memo/issues/122)

## Purpose

Before the UI replacement (#98 to #105), measure the problems of the current screens and link the improvements, with priorities, to follow-up issues.

## Change — 2026-10-21

- `docs/ux-audit/2026-10-21.md` (new): audit method, per-page measurements, results of 6 task scenarios, improvements U-01 to U-16 (severity, evidence, proposal, linked issue), and the re-measure procedure
- `docs/ux-audit/2026-10-21/*.png` (new): 9 screenshots at 390px and 1 at 1280px. Only the seed data of the test DB for the audit is visible.
- Improvements that were not in existing issues were registered as new issues.
  - [#123](https://github.com/sirloinbh/workout-memo/issues/123) the body records default period of 1 week shows an empty graph (bug)
  - [#124](https://github.com/sirloinbh/workout-memo/issues/124) exercise name autocomplete
  - [#125](https://github.com/sirloinbh/workout-memo/issues/125) exercise analysis mobile information structure
- App code and test code were not changed. Only documents and images were added.

## Verification

- Audit environment
  - Created a new audit DB in a local-only test DB container.
  - Applied 001 to 014 with `npm run db:migrate`.
  - Started API 3101 and Vite 5174 and measured with Playwright (installed Chrome). The personal DB was not used.
- Document checks (Node 24.21.0)
  - `npm run format:check`: pass
  - `npm run test:docs`: 3 pass, 0 fail
- Not done
  - Real phone test: needs the user's device.
  - Lighthouse mobile: the DevTools MCP run was stopped after 30 minutes without a response.
  - Both continue with the 're-measure' procedure of the audit document.
- App behavior did not change, so no app tests were added.

## Limits and follow-up

- The seed data is about 4 weeks and 9 exercises. With hundreds of records, the length problems of the list and analysis get worse.
- Order of application: #98 (baseline), then #105 (journal input). #123 can be fixed first, independently.
