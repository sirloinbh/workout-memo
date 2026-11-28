# Remove the Rest timer settings and the rest-over push notification (#528)

Part of epic #524. User decision (2026-11-28): remove the rest timer feature entirely. #527 removed it from the editor; this issue removes the Settings card, the push switch, the server push and the stored data.

## Change

- **Settings** (`frontend/src/settings.tsx`): no rest-over switch and no push warning banner. Notifications keeps the weekly summary switch (`WeeklySummaryToggle`), which subscribes the browser itself.
- **Frontend push**: deleted `workspace/use-push.ts` and `workspace/rest-push-toggle.tsx`; `usePush()` is no longer called in `app.tsx`; `disablePush` is removed from `push.ts` (only the removed switch used it). The service worker `public/push/sw.js` no longer special-cases the rest push (it used to stay silent for a visible app); every push is shown, and the fallback text is the weekly summary.
- **Browser keys**: `workspace/legacy-storage.ts` clears `workout-memo:rest-timer:v1` and `workout-memo:rest-durations:v1` once on load (called from `app.tsx`). This is the only place the old key names remain besides the migration.
- **API**: `PUT /api/push/rest` and `DELETE /api/push/rest` are removed (now the JSON 404 for unknown `/api` paths). `restPushSchema` is removed from `shared/contract.ts` (`backend/src/contract.ts` regenerated with `npm run contract:sync`). `backend/src/openapi.ts` and `docs/openapi.json` are regenerated. `push.subscriptions` routes, `GET /api/push/config` and the weekly summary routes stay.
- **Server**: `backend/src/web-push.ts` no longer schedules or sends rest pushes (no `scheduleRest`, `cancelRest`, `sendDue`, timer or `start()`). `sendToUser` (weekly summary) stays. `start()` is replaced by `stop()`, which waits for sends in progress; `server.ts` calls it on SIGTERM. `deleteSubscription` no longer touches the dropped table. The `now` option of `createApp` (used only for the rest end time check) is removed.
- **Database**: new migration `database/migrations/025_drop_rest_pushes.sql` runs `DROP TABLE IF EXISTS rest_pushes` (safe to re-run). It held only short-lived pending-push rows. `push_subscriptions` stays for the weekly summary. Old migrations are untouched.
- **Docs**: `database/README.md`, `docs/api.md`, `docs/deployment.md` (2-2), `docs/mobile-app.md`, `docs/design-system.md`, `docs/next-steps/README.md`, `.env.example`, `compose.yaml` comments.
- Also removed the now-unused `exercise-body-parts` query invalidation in `use-routine-progress.ts` (it only fed the rest timer) and a stale comment in `workspace/model.ts`.

## Left as is

- `git grep -i -E "rest.?timer|restSeconds|restDuration|Rest over|rest_pushes"` still finds: this record, old migrations and the new drop migration, `workspace/legacy-storage.*` (the two key names), and dated history in `docs/fitness-app-research-2026.md`, `docs/ux-audit/2026-10-21.md` and one line of `docs/next-steps/README.md`, which describe what existed then. `frontend/src/components/ui/switch.tsx` has a comment example ("auto-starting the rest timer") but it is a centrally managed file, so it is not edited here (raise it in `sirloinbh/project-standards` if wanted).

## Tests

- Deleted the rest cases in `frontend/src/push.test.tsx` (the rest-over worker behavior, the rest switch) and rewrote it for the weekly summary: worker shows the notification even while the app is visible and has no rest handling; the weekly summary switch subscribes (permission, worker scope, key, POST body) and nothing is half-enabled when the server cannot save.
- `frontend/src/settings.test.tsx`: no rest text or rest switch on Settings. New `frontend/src/workspace/legacy-storage.test.ts`.
- `backend/test/web-push.test.ts`: the rest-end routes answer 404 and run no query; one-off pushes (`sendToUser`) go to every subscription, a 410 subscription is removed, a stuck sender hits the deadline. `backend/test/web-push.integration.test.ts` and `backend/test/resilience.test.ts` follow. The DB integration tests skip locally (no Docker); CI runs them, which also applies migration 025.

## Checks

See the PR for the `npm run check` results.
