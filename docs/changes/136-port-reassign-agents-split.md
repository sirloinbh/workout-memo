# #136 Change ports to the central standard (slot 01) and split the AGENTS project-specific rules

- Issue: https://github.com/sirloinbh/workout-memo/issues/136
- Central tracking issue: https://github.com/sirloinbh/project-standards/issues/95

## Purpose

- Apply the ports (slot 01) that the central registry assigned again so that the ports of the 8 apps do not overlap. Now the Vite default port 5173 overlaps with health-log, and the e2e web port 5174 overlaps with the life-journal Vite.
- Before the first central standards sync turns AGENTS.md into the shared instructions, move the rules that are specific to this project into AGENTS.project.md to keep them.

## Change

| Kind    | Before               | After               | Files changed                                                                                                                                   |
| ------- | -------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | 8088                 | 8101                | `compose.yaml`, `README.md`, `docs/api.md`, `docs/deployment.md`, `docs/shared-hosting-costs.md`                                                |
| API     | 3001                 | 3101                | `compose.yaml`, `backend/src/server.ts`, `backend/Dockerfile`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `.env.example`, 2 README files |
| Vite    | 5173 (not specified) | 5201 (`strictPort`) | `frontend/vite.config.ts`, `README.md`                                                                                                          |
| Host DB | 55432                | 15401               | `compose.yaml`, `.env.example`, `database/README.md`, `docs/deployment.md`                                                                      |
| e2e API | 3101                 | 3201                | `playwright.config.ts`, `AGENTS.project.md`                                                                                                     |
| e2e web | 5174                 | 5301                | `playwright.config.ts`, `AGENTS.project.md`                                                                                                     |

- The port examples in `docs/ai-agent-project-setup.md` were changed to the new values and the central slot formula.
- The past records in `docs/changes/`, `docs/daily/`, `docs/ux-audit/`, and `docs/next-steps/` show the state at that time, so they were not changed.
- **AGENTS split:** I moved the service rules (weight, NULL), the PR automatic review and merge rules, accounts and tools, the current implementation, project-specific skills and design, project-specific verification commands, and local agent work into `AGENTS.project.md`. The sentences were not changed, and only the moved e2e ports were changed to the new values. `AGENTS.md` keeps only the shared content and requires reading `AGENTS.project.md`.

## What the user has to do

- Change the port of `DATABASE_URL` in the local `.env` from `55432` to `15401`. `.env` is not committed, so this PR does not change it.
- The production server sets the web port with `WEB_BIND` and `WEB_PORT` in `.env`, so it is not affected. The internal API port (3101) is changed together in compose, nginx, and the Dockerfile.

## Verification

- The `npm run check` result is written in the PR body below.
- e2e (ports 3201 and 5301) is checked in the PR CI. There is no test DB locally, so it was not run.
