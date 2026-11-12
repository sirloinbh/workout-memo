---
name: workout-testing
description: Write or update behavior-focused tests with workout-memo implementations and fixes, run them before commits and PR creation or updates, and record actual results. Use with workout-implementation; for documentation-only changes validate the changed artifacts instead of adding unrelated app tests.
---

# Workout Memo Writing and Running Tests

Follow the project's AGENTS.md and the workout-implementation procedure together. This skill sets the standard for writing and running tests; it keeps the issue, branch, docs, and PR procedure and the merge-after-CI policy.

## Write them together with the implementation or fix

- When you implement a feature or change behavior, add or update the test code that verifies that requirement, and include the implementation and the tests in the same work commit. Do not let running the existing tests stand in for verifying the new feature.
- For a bug fix, add a regression test that catches the bug coming back. If possible, confirm it fails before the fix and passes after, and if you cannot reproduce it, record that limit.
- A refactor verifies that existing behavior is preserved. If the related tests are enough you can keep them as they are, but strengthen the scenarios that are lacking.
- Verify results the user sees and domain rules rather than writing tests that repeat the internal implementation. Choose the normal path plus the input errors, boundaries, and failure paths related to the change.
- Choose unit tests for business logic, integration tests for the API, DB saves, and transactions, and component or browser tests for screen input and save flows. Do not add every kind to every change.
- Current tools: node:test for backend unit and DB integration (`backend/test`), Vitest, jsdom, and React Testing Library for screen components (`frontend/src/*.test.tsx`), and Playwright for real browser flows (`e2e/`, `npm run test:e2e`). Screen tests verify by the roles, labels, and text the user sees, not by internal hooks. Fix dates with `fixClock` in `frontend/src/test/api.ts` and replace the API with `mockApi`.
- Check which test tools and commands are installed now. Do not report that you used a tool that is not installed.
- If a screen flow, an address, or a real DB save changes, add or update the Playwright scenarios in `e2e/`. Run `npm run test:e2e` with the test DB (`E2E_DATABASE_URL`) and do not use a personal DB.
- Shared screen checks (#113): `e2e/ui-*.spec.ts` check every page and the main modals with the fixed data and clock in `e2e/support/ui-fixtures.ts`. When a page, a modal, or an API response is added, update this fixed data and the list together.
  - Responsive: at 360, 390, 768, and 1280px there is no horizontal overflow, and fixed or sticky elements (the sidebar, the bottom tabs) do not cover controls.
  - Accessibility: axe WCAG 2.1 A/AA. Only existing low-contrast color combinations are allowed, per screen, in `e2e/a11y-known-contrast.json`. A new combination or a violation of another rule fails. When you fix a color, delete its entry, and do not add a new low-contrast color to the list to make a check pass. The per-screen check fails on an allowed combination that never appeared at either 390 or 1280px width and on a screen name that is not checked, so the list can only shrink (#131).
  - Visual regression: the baselines of `e2e/ui-visual.spec.ts` are in `e2e/__screenshots__/`. To match font rendering, they are compared only in the fixed container of the CI `e2e` job (`mcr.microsoft.com/playwright:v1.63.0-noble`, `E2E_VISUAL=1`) and are skipped in local runs such as Windows. CI does not write the baselines. The image is pinned by digest in `.github/workflows/ci.yml`. When you upgrade `@playwright/test`, switch to the digest of the same-version image and recreate the baselines.
- When you update the baselines for an intended screen change:
  1. When you push the PR, the CI `e2e` fails because of the screen difference. Use the diff images in the `playwright-report` artifact to check that only the intended screens changed.
  2. Download the `visual-baselines` artifact of the same run and overwrite `e2e/__screenshots__/` with it. Example: `ghp run download <run-id> --name visual-baselines --dir e2e/__screenshots__` (through `scripts/gh-project.ps1`, the short options `-n` and `-D` cause an argument error).
  3. Check with `git diff --stat e2e/__screenshots__` that only the intended screens changed, and put them in the same commit as the implementation. Write the number of files updated and the reason in docs/changes and the PR.
  4. Do not update the baselines for an unintended difference; fix the implementation.
- For a screen change that must not change the look (tokenizing, extracting components, adopting a CSS tool), confirm with a before-and-after pixel comparison in real Chrome. Take the baseline twice and confirm the difference is 0 first, then compare, and record the number of shots compared and the differing pixels. Follow the [verified repeatable procedures](../workout-foundation/references/procedures.md) of workout-foundation.
- If the mock API accepts input that the real server would reject, fix the test data to match the real contract (`shared/contract.ts`), not the mock.
- Keep test data separate from production and user data. Write checks that depend on time, dates, or random values so that they verify the same meaning when the run environment changes.

## Before committing

- Check the changes and tests of the final commit and actually run the related tests. Include the implementation, the tests, and the docs record in the same commit.
- Leave the test code paths, the behavior verified, and the commands run and their results in the matching issue record in docs/changes.
- Do not make a failing test pass by skipping it, deleting it, or weakening an assertion. Fix the failure, then commit.
- If you cannot prepare the needed run environment, record that you did not run it. Do not report unverified implementation as done, and hand over a PR that still has verification left as a draft.

## Before creating or updating a PR

- Run the related tests and the project's required checks on the final diff and confirm they pass. If nothing has changed since the commit and the result for the same target is still valid, you do not need to repeat the same check.
- In the PR, record the tests you added or changed, the commands run, pass/fail/skip, and the reason for anything not run. Do not count an integration test that was skipped because a DB environment variable was not set as a success.
- If you fix code or tests after the PR, re-run the affected checks and update the results in the docs and the PR. Fix CI failures too.
- If only docs, skills, or formatting changed and app behavior did not change, verify with the validators, format, and link checks for those artifacts, and write why you did not add app tests. A behavior change in executable code or in a check script includes the related tests or a run verification.
- Add or change related tests in the fix commits from the automatic PR review too, and run them again. Merge the PR only after all the required CI checks on the final head pass. For stacked PRs, re-run the tests after merging main.
