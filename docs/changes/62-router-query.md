# #62 React Router URL navigation and TanStack Query server queries

- Issue: [#62](https://github.com/sirloinbh/workout-memo/issues/62) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 3: screen foundation)
- Branch: `feat/62-router-query`. Stacked on #60 (PR #61). The merge order is #59 → #61 → this PR.

## Purpose

- Screen navigation was only the `page` state, so a reload went back to the dashboard. Sharing an address and the back button did not work either.
- Server queries prevented racing responses with a manual `refresh` and a version counter. Refreshing after a save was also called by hand.

## Change — 2026-10-20

### Packages

I installed them after the user's explicit approval that they are aware of the supply chain risk.

- Installed: react-router 8.4.0 and @tanstack/react-query 5.104.1. Pinned to exact versions, with `--ignore-scripts`.
- Versions: published at least 14 days ago.
- Check: 5 packages were newly added (including @remix-run/route-pattern, @tanstack/query-core, and cookie-es). None has an install script.
- I regenerated the `frontend/package-lock.json` for the subtree in a temp directory with `--package-lock-only --ignore-scripts --before=2026-10-06`.

### React Router

- Page URLs: `/` (dashboard), `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`.
- An unknown path replaces to `/`.
- The existing nginx `try_files ... /index.html` sends every path to the app, so there is no server config change.
- The menu and the logo became `NavLink`. I added `nav aria-label="주요 메뉴"` (main menu), and the current page gets `aria-current="page"` and `.active`.
- In CSS, I moved `nav button` to `nav a` to keep the existing look.
- The navigation buttons inside the body ("전체 보기" (view all), and others) stay buttons and only use `navigate`.
- `App` wraps `QueryClientProvider` and `BrowserRouter`. `Workspace` handles the screen body. The QueryClient is created anew on every app mount, so tabs and tests are independent of each other.

### TanStack Query

- I changed these queries used by the dashboard, journal, goals, and machines to queries.
  - `['workouts', from, to]`
  - `['goals']`, `['machines']`, `['brands']`
  - `['official-machine-weights']` (handled as `null` even on failure, so it does not block the journal query)
- The period is part of the query key, so a late response from an earlier period cannot change the data, error, or loading state of the selected period. This keeps the existing rule without a version counter.
- After a save, delete, or backup restore, `invalidateQueries()` re-fetches only the active queries (the current period and the shared lists). This behavior is verified by the "one more request" check in the existing tests.
- I set `retry: false`, `refetchOnWindowFocus: false`, and `refetchOnReconnect: false`. A failure is retried with the "다시 연결" (reconnect) button, as before. The rest timer uses the focus event, so I made it not re-fetch automatically on focus.
- Behavior change: moving between pages does not re-fetch the journal of the same period (it reuses the cache). The old code also fetched only when the period changed, so the result is the same.
- The queries inside the routine, analysis, body records, and backup pages are kept as they are in this scope.

## Tests

- The 77 existing screen tests: I changed menu clicks to `openPage` in `frontend/src/test/nav.ts`. This helper clicks the link and then also checks `aria-current="page"`. I did not change the other assertions. The setup resets the address to `/` after every test.
- The new `frontend/src/routing.test.tsx` (5 tests)
  - Going directly to a URL opens that page, and the menu marks it as the current page.
  - An unknown address goes to the dashboard.
  - A menu link changes the URL, and the back button restores the previous page.
  - Moving between pages does not re-fetch the journal.
  - A query failure is shown, and reloading with "다시 연결" removes the warning.
- I added a real Chrome scenario to `e2e/workout-crud.spec.ts`: My goals (나의 목표) → it persists after a reload → Routine planning (루틴짜기) → the back button restores My goals.

Run results (Node 24.21.0, dedicated test DB, local Chrome):

| Check                       | Result                                        |
| --------------------------- | --------------------------------------------- |
| `npm run check`             | **EXIT=0**                                    |
| Backend node:test (with DB) | **272 pass / 0 fail / 0 skip**                |
| Frontend Vitest             | **10 files, 82 pass / 0 fail**                |
| Workers / skills            | 212 pass / 4 pass                             |
| `npm run test:e2e`          | **2 passed** (journal CRUD, URL persistence)  |
| `docker build ./frontend`   | Success                                       |

## Limits and follow-up

- This is a personal app with no login, so there is no route protection or permission handling.
- The following proceed as step 3 follow-up issues: React Hook Form with shared Zod, and design tokens with shared components.
