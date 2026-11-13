# #60 Move screen tests to Vitest and RTL, and verify the journal CRUD with Playwright

- Issue: [#60](https://github.com/sirloinbh/workout-memo/issues/60) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 4: wider verification)
- Branch: `test/60-vitest-playwright`. It is stacked on #58 (PR #59), so #59 must be merged first.

## Purpose

The 9 existing screen test files transpiled `main.tsx` and then ran it in a vm with their own hook adapter (useState, useEffect, useRef, and useCallback). This approach had two limits.

- Tests break when only the internal implementation changes, as when step 3 introduces React Router, TanStack Query, and React Hook Form.
- They cannot verify the real DOM, events, React scheduling, or browser behavior.

## Change — 2026-10-20

### Packages

I installed them after getting the user's explicit approval that they are aware of the supply chain risk. Versions are pinned exactly, and I installed with `--ignore-scripts`.

Selection criteria:

- The official repository and publisher
- The newest version published at least 14 days ago. Many of the newest releases at that time were published 1 to 9 days earlier, so I excluded them.
- Peer compatibility: React 19.3.0 and Vite 6.4.4

| Location      | Packages                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frontend(dev) | vitest 5.0.3, jsdom 30.1.2, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.7, @testing-library/jest-dom 7.0.1 |
| root(dev)     | @playwright/test 1.63.0. It does not download a browser and uses the installed Chrome (`channel: 'chrome'`)                                                 |

Checks after the install:

- Of the 76 packages newly added to the lockfile, none has an install script. Only the existing esbuild and fsevents do.
- I searched for IOC domains (webhook.site, ngrok, and others) and suspicious workflows, and found none.
- `npm audit`: 0 vulnerabilities.
- Direct dependencies are pinned versions, and transitive dependencies are pinned in the lockfile.

### Moving the screen tests

- I moved `App` from `frontend/src/main.tsx` to `frontend/src/app.tsx` and exported it. `main.tsx` only renders. I did not change the app behavior code.
- Test foundation:
  - `frontend/vitest.config.ts`: jsdom, and a `TZ=UTC` machine clock
  - `frontend/src/test/setup.ts`: cleanup, restoring timers, globals, and mocks, and resetting localStorage
  - `frontend/src/test/api.ts`: `fixClock` fixes only Date to 2026-10-14T15:30Z (Seoul 10-15 00:30). `mockApi` replaces fetch and records requests. It also includes the `json` and `deferred` helper functions.
- The number of moved scenarios is the same as the original.

| Before (`backend/test`, deleted)                        | New file (`frontend/src`)                            | Scenarios     |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| period-ui.test.ts                                       | period.test.tsx                                      | 21            |
| workout-draft-ui.test.ts                                | workout-draft.test.tsx                               | 18            |
| set-completion-ui.test.ts                               | set-completion.test.tsx                              | 8             |
| routines-ui.test.ts                                     | routines.test.tsx                                    | 6             |
| routine-progress-ui.test.ts                             | routine-progress.test.tsx                            | 7             |
| analysis-ui / backup-ui / body-ui / official-weights-ui | analysis / backup / body / official-weights.test.tsx | 3 / 4 / 4 / 6 |

- I did not weaken any assertion. The parts that are not exactly the same as the original but moved to the closest equivalent expression:
  - **Input**: in jsdom, date and number inputs cannot take key presses, or drop intermediate decimal values. So I set the value with `fireEvent.change`.
  - **Pressing twice in the same render** (duplicate submit, confirming a rest, tapping set complete repeatedly): the old tests called the handler twice in the same render, and I reproduced that by clicking twice inside one `act()`.
  - **Request time limit**: React and testing-library also use setTimeout, so I track only the 15-second timer and check that exactly one remains.
  - **A submit that skips required-input validation**: to keep the meaning of the old tests that called `onSubmit` directly, some tests use `fireEvent.submit`.
  - **Large backup file**: the old `/10MB/` check also matched the static notice text, so it always passed. So I added a check that the warning itself contains 10MB.
- The analysis and routine progress tests compute the mock responses with the real backend `analyze`, `routineSchema`, and `routineProgress`, as before (`backend/src` imports).
- The pure function tests (`rest-timer`, `routine-progression`, `service-date`) do not depend on the screen structure, so I left them in `backend/test`.

### Browser verification (Playwright)

- `playwright.config.ts`
  - It starts the API (`tsx backend/src/server.ts`, 3101) and the screen (Vite, 5174). The ports do not overlap with the local dev servers (3001 and 5173).
  - The DB is `E2E_DATABASE_URL` (or `TEST_DATABASE_URL` if missing). If neither exists, it fails before starting so that it never uses the personal DB.
  - It runs Chrome with Asia/Seoul and ko-KR.
- I made the proxy target in `frontend/vite.config.ts` changeable with `API_PROXY_TARGET`. The default is the existing 3001.
- The `e2e/workout-crud.spec.ts` scenario:
  - It creates a journal with a newly made unique title on a fixed past date (total weight 100.25kg × 5).
  - It checks the list and the cumulative volume of 501.25kg, and that they remain after a reload.
  - After an edit it becomes 600kg, and it checks that this persists after a reload.
  - After a delete, it checks that the list has 0 items and the volume is 0kg, and that this stays after a reload.
  - Data left behind by a failure is cleaned up through the API in afterAll.
- I added `e2e/tsconfig.json` and included it in the root `typecheck`. `test-results/` and `playwright-report/` are ignored.

### Commands, CI, and documents

- The root `npm test` runs both the backend node:test and the frontend Vitest. To run only the frontend, use `npm run test -w frontend`.
- I added `npm run test:e2e`.
- I added an `e2e` job to CI: a PostgreSQL service, `db:migrate`, `test:e2e`, and a report upload on failure.
- I updated AGENTS.md (verification commands), README, `skills/workout-testing/SKILL.md` (current tools and writing criteria), and `stack.md`. I also ran `npm run skills:sync`.

## Tests

Environment: Node 24.21.0, npm 11.19.0, a dedicated test DB (127.0.0.1:55434), and local Chrome

| Check                       | Result                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `npm run check`             | **EXIT=0** (format, lint, typecheck (including e2e), and build pass)             |
| Backend node:test (with DB) | **272 pass / 0 fail / 0 skip**. The 77 moved UI tests are gone (349 before)      |
| Frontend Vitest             | **9 files, 77 pass / 0 fail**. I repeated it twice more separately, both 77 pass |
| Worker and skill tests      | Pass inside check                                                                |
| `npm run test:e2e`          | **1 passed** (local Chrome, test DB)                                             |

## Limits and follow-up

- CI e2e uses the Google Chrome preinstalled on ubuntu-latest. If Chrome is dropped from the runner image, a separate install step is needed.
- The screen layout and focus movement are not in the scope of this e2e. It verifies only the journal CRUD flow.
- Step 3 (React Router, TanStack Query, React Hook Form, and design tokens) proceeds in a separate PR with these tests as a safety net.

## CI docker-build fix — 2026-10-20

- After the PR, the `docker-build` in CI failed. There were two causes.
  - The `frontend/package-lock.json` for subtree deployment lacked the new devDependencies, so `npm ci` in Docker failed.
  - The Docker context has no `backend/` and no `@types/node`. But the build `tsc` also checked the test files and `vite.config.ts` that import them.
- I regenerated `frontend/package-lock.json` in a temp directory (`npm install --package-lock-only --ignore-scripts --before=2026-10-06`). Transitive dependencies also use only versions published before 2026-10-06, and there is no new install script.
- I added `frontend/tsconfig.build.json`. The build type-checks only the app source and excludes the tests and `vite.config.ts`. The full type check is still handled by the monorepo `npm run typecheck`.
- Verification: local `docker build ./frontend` and `docker build ./backend` both succeed.
