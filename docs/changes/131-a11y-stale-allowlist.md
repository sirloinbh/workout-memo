# #131 Detecting stale color pairs in the accessibility allowlist

- Issue: [#131](https://github.com/sirloinbh/workout-memo/issues/131)
- Branch: `test/131-a11y-stale-allowlist`

## Purpose

The axe check of #113 (PR #130) allowed existing low-contrast color pairs per screen in `e2e/a11y-known-contrast.json`. But it did not detect entries that no longer appear. If an entry was not removed after the color was fixed, going back to the old low-contrast color would pass silently. This work was split from comment 3 of the first automatic review of PR #130.

## Change — 2026-10-22

- `e2e/ui-a11y.spec.ts`
  - Tests that were separate for each screen × width were merged into one per screen. One test checks 390px and 1280px in turn and collects the allowed pairs that actually matched.
  - If there is a pair that is in the list but does not appear at either width, it fails. The message shows the screen name and the pair.
  - All the information needed for the judgment is inside one test, so there is no false failure even when only some tests are run with `--grep`. It does not depend on aggregation across tests or on run order.
  - A new browser context is opened for each width. When the same context was used, a draft that the workout log modal left in `localStorage` disabled the "운동 기록하기" (log a workout) button on the next page, and the test failed.
  - Violations per width are recorded with `expect.soft`, so even if one width fails, the results of the other width and the stale pair judgment are shown together.
  - New test `허용 목록은 검사하는 화면만 가리킨다` (the allowlist points only to screens that are checked): it fails if a screen name in the list is not among the pages and modals that are checked. It catches entries left after a screen is deleted or renamed.
- `skills/workout-testing/SKILL.md` (+ `npm run skills:sync`): wrote the check behavior that the list only shrinks.
- The allowlist (`a11y-known-contrast.json`) was not changed. All 121 current pairs really appear.

## Verification

Local Windows 11, installed Chrome. There is no test DB or Docker, so, as in #130, I ran it with a temporary Playwright config (not committed) that starts only the screen server. The accessibility check answers every API with fixed data through `page.route`, so no API server is needed.

- `npx playwright test e2e/ui-a11y.spec.ts` (temporary config): 12 passed (8 screens, 3 modals, 1 list screen name)
- Checks where I broke it on purpose (temporary change, then reverted)
  - added `#123456 on #ffffff`, which is not used in `backup` → failed with `backup: 허용 목록에 있지만 390·1280px 어디에도 나타나지 않은 조합 ...` (backup: pair in the allowlist that appears at neither 390 nor 1280px ...) and `#123456 on #ffffff`
  - added a screen `old-screen` that does not exist → the list screen name test failed with `old-screen`
  - ran only `--grep "journal 화면" (journal screen)` → 1 passed (no false failure)
  - deleted one pair that is in use in `backup` → failed with a `color-contrast` violation as before
- `tsc -p e2e/tsconfig.json`, `eslint e2e/ui-a11y.spec.ts`, `prettier --check e2e skills .claude/skills`: passed
- `npm run test:skills` 4 pass, `quick_validate.py skills/workout-testing` (`PYTHONUTF8=1`): valid
- `npm run check` (no DB, process-only `PSExecutionPolicyPreference=Bypass`): passed
  - backend 206 pass / 35 skip (DB integration not run), frontend 121 pass, `test:agents` 167, `test:skills` 4, `test:docs` 3, build succeeded
- Visual regression and the e2e that uses the DB were not run locally. The `e2e` job of the PR CI runs all of them.

## First automatic review — 2026-10-22

A separate read-only review agent reviewed the whole diff of PR #135. The result is **nothing to fix**. According to the review count policy, it is merged after CI passes, without a second review.

- Switching to `browser.newContext` loses no settings. `channel` is per browser, and `baseURL`, `locale`, and `timezoneId` are passed directly. The installed Playwright also applies trace (`retain-on-failure`) and the default time limit to a context created directly.
- In the container of the latest main CI (run 39692517095), the existing a11y test took about 2 seconds per width. The merged test also has plenty of margin to the default 30-second limit.
- The judgment uses the union of the two widths, so a pair that appears at only one width causes no false failure. `ui-visual` and `ui-responsive` are not affected.
- nit (not applied): only three context options are picked and passed, so if a context option such as `colorScheme` is added to the config `use` later, it will not apply to this test. The current behavior is correct, so I only leave a note. It should be passed along when such an option is added.
