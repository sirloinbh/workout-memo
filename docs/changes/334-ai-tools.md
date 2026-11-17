# #334 First AI tools for the shared AI service

- Issue: https://github.com/sirloinbh/workout-memo/issues/334
- Branch: feat/334-ai-tools
- Central: sirloinbh/project-standards#559 (managed `standard/tools.ts`, PR #624), ADR-0017

## Changes

- `backend/src/ai-tools.ts`: `list_workouts` (read, at most 366 days) and `add_workout` (write), using the app's own Zod schemas.
- `backend/src/routes/workouts.ts`: `listWorkouts` and `insertWorkout` are shared by the routes and the tools; the routes behave as before.
- `backend/src/app.ts`, `backend/src/server.ts`: `registerToolRoutes` with `AI_TOOLS_PUBLIC_KEY`; without it no tool route exists.
- `backend/test/ai-tools.integration.test.ts`, `docs/api.md` ("AI tools (internal)").

## Verification

- Postgres 17 in a throwaway container with all 17 migrations; `tsx --test test/*.test.ts` with `TEST_DATABASE_URL`: 391 pass, 0 fail, 0 skipped. The new test covers the list, 401 (no token, wrong key), 403 (read scope for a write tool), 400 (invalid input, a range over 366 days), a successful add and list, and the audit rows (`denied`, `error`, `ok`).
- ESLint `--max-warnings 0`, Prettier, `tsc -p tsconfig.check.json`, `.standards/check.mjs`.

## Deploy

- No visible change: the tools stay off until shared-ai (project-standards#611) sets `AI_TOOLS_PUBLIC_KEY` and joins the API container to its network.
