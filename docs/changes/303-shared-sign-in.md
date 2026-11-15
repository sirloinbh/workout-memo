# #303 Require the shared sign-in

## Change

- `backend/src/app.ts`: `createApp` takes an `auth` middleware and mounts it on `/api` before any route; `/api/health` stays open (the middleware's `publicPaths`). New `GET /api/me` returns the signed-in user.
- `backend/src/server.ts`: builds the middleware from `@sirloinbh/auth-client` when `AUTH_INTERNAL_URL` is set, and refuses to start in production without it.
- `compose.yaml`: the API joins the external `shared-auth` network and checks sessions at `http://shared-auth-api:3110`.
- `frontend/src/sign-in.tsx`, `auth-origin.ts`: on `<app>.<domain>` the screen asks `/api/me`, sends a signed-out visitor to `https://auth.<domain>/sign-in`, and shows the account and a sign-out link in the top bar. On localhost and IP addresses nothing changes.
- `docs/api.md`, `backend/src/openapi.ts`, `docs/openapi.json`: the `/api/me` row, the sign-in rule, and 401/503 status texts.

## Reason

- The app had no login and relied only on the IP allow list. The shared sign-in is live (sirloinbh/project-standards ADR-0015, #550); this app is the pilot before the other 7.

## Verification

- `npm run check` steps run locally: format, lint, contract, typecheck, frontend tests (61 files, 333 pass, 4 skipped), skills, docs, build all pass. Backend: 253 tests pass, including `sign-in.test.ts` and `openapi.test.ts`; the tests that need PostgreSQL ran in CI only (no local database).
- `/api/health` stays public, so `deploy/notify.sh` and `remote-deploy.sh` health checks keep working.
