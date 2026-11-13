# #172 Align backend error responses with the central shared HTTP file

- Issue: [#172](https://github.com/sirloinbh/workout-memo/issues/172)
- Branch: `fix/172-http-errors`

## Purpose

Align error responses with the centrally managed file `backend/src/standard/http.ts` that the other 7 apps use (sirloinbh/project-standards#309, already synced). Until now three things differed.

- A path under `/api` that does not exist got the default Express HTML 404.
- Path IDs were read with `z.coerce.number()`, so `"1e3"` and `" 7 "` were also accepted as IDs.
- Deleting a goal that does not exist gave `404 { ok: false }`. Other errors use the `{ error }` format.

## Change — fix: switch to the central error handling

- `backend/src/routes/shared.ts`: deleted the app's own `errorHandler` and `id()`. Only `appErrors`, which handles the messages specific to this app, is left, and everything else is passed to the central `errorHandler` with `next(err)`. Three messages are kept.
  - `23503` (official reference value FK): "선택한 공식 참고값이 존재하지 않습니다" (the selected official reference value does not exist)
  - `23503` (other): "선택한 머신 또는 브랜드가 존재하지 않습니다" (the selected machine or brand does not exist)
  - `413` (backup path only): "요청 크기 제한을 초과했습니다 (백업 파일은 최대 10MB)." (the request size limit was exceeded (a backup file is at most 10MB))
- `backend/src/app.ts`: after all feature routes, it puts `app.use('/api', notFound)`, `appErrors`, and the central `errorHandler` in order.
- `routes/body-measurements.ts`, `goals.ts`, `machines.ts`, `routines.ts`, `workouts.ts`: changed 9 places of `id(req.params.id)` to `parseId(req.params.id, '<target>')`. The targets are body record, goal, machine, routine, and log. An invalid ID becomes a 400 "<target> ID가 올바르지 않습니다" (the <target> ID is not valid) before any DB query.
- `routes/goals.ts`: deleting a goal that does not exist gives 404 `{ error: '목표를 찾을 수 없습니다' }` (goal not found). Success is still 200 `{ ok: true }`.
- `backend/src/openapi.ts`, `docs/openapi.json`: added 400 to 6 operations that take a path ID and lacked 400, and regenerated with `npm run openapi`. The 6 are `DELETE` of workouts, goals, and body-measurements, `GET /api/routines/:id`, and the two routine rest operations. The old `z.coerce` also returned 400, but it was not in the document.
- `docs/api.md`: wrote the ID rules, the 404 for a path under `/api` that does not exist, the 500 message, and the roles of the central file and `appErrors`, and deleted the paragraph about the `{ ok: false }` exception of `DELETE /api/goals/:id`.

## Responses that change

| Case                                                      | Before                                                                                     | After                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A path under `/api` that does not exist                   | 404 HTML                                                                                   | 404 `{ "error": "요청한 API를 찾을 수 없습니다" }` (the requested API was not found)  |
| An ID like `1e3`, `%207%20` with spaces around, or `07`   | Accepted (turned into a number) or a Zod message                                           | 400 `{ "error": "<target> ID가 올바르지 않습니다" }` (the <target> ID is not valid)  |
| Deleting a goal that does not exist                       | 404 `{ "ok": false }`                                                                      | 404 `{ "error": "목표를 찾을 수 없습니다" }` (goal not found)                         |
| A broken JSON body                                        | 400 "요청 형식을 확인하세요" (check the request format)                                    | 400 "요청 본문의 JSON 형식이 올바르지 않습니다" (the JSON format of the request body is not valid) |
| A server error (DB connection and so on)                  | 500 "저장소에 연결할 수 없습니다. 서버 상태를 확인하세요." (cannot connect to the storage; check the server status) | 500 "서버 오류가 발생했습니다" (a server error occurred) |

## Effect on the screens

- The `shared/` contract was not changed. The screen code was not changed either.
- `api()` of the screen (`frontend/src/app.tsx`) shows the `error` of the response as it is when a request fails. So there are two places that change.
  - My goals screen: deleting a goal that was already deleted shows "목표를 찾을 수 없습니다" (goal not found) instead of "요청에 실패했습니다" (the request failed).
  - All screens: the text shown on a server error becomes "서버 오류가 발생했습니다".
- There were no screen tests that check these texts.

## Tests

- Added: 5 tests in `backend/test/http-errors.test.ts`. They use a fake pool instead of the DB, so they run without a test DB.
  - A path under `/api` that does not exist gives a JSON 404.
  - The IDs `1e3`, `%207%20` with spaces around, `0`, `-1`, `1.5`, `abc`, and `07` give a 400 that contains the target name, without a DB query.
  - Deleting a goal that does not exist gives 404 `{ error }`, and deleting one that exists gives 200 `{ ok: true }`.
  - The two `23503` messages and the 500 message come out, and the internal message is not put in the response.
  - A broken JSON body gives 400.
- `tsx --test test/http-errors.test.ts`: 5 pass
- The related file group (`http-errors`, `api-contract`, `openapi`, `period-api`, `workout-validation`, `machines`, `body-measurements`, `goals`, `backup`): of 86, 82 pass, 4 fail. The 4 failures are DB integration tests in `goals.test.ts`. This PC has `TEST_DATABASE_URL`, but PostgreSQL is not running, so they failed with `ECONNREFUSED 127.0.0.1:5432`. `backup.integration.test.ts`, which was not in this group, had an assertion that checks the changed behavior (see the first review fix below). DB integration tests are confirmed with the CI `verify`, which has a PostgreSQL service.
- `npm run typecheck -w backend`, eslint, prettier, `npm run standards:check` (passed, no warnings): passed
- I did not run the full local `npm test` and `npm run check` to the end because of a history of running out of memory. I started the whole backend test once, but it stalled after more than 10 minutes. The full check is confirmed with CI.

## Change — fix: first review fixes

- (Required) The broken JSON case in `backend/test/backup.integration.test.ts` expected the old text (`/요청 형식/`), so it would have failed in the CI `verify`, which has PostgreSQL. I missed it because the DB is off on this PC. I changed it to the central text "요청 본문의 JSON 형식이 올바르지 않습니다". I also corrected the first record in the tests section above that said "there is no assertion that checks the changed behavior". No other test, screen, or e2e expects the old text.
- (Optional) 413: before, even a 256kb ordinary request got the "백업 파일은 최대 10MB" (a backup file is at most 10MB) text. Now the app text is used only on `/api/backup/` paths, and the others go to the central "요청 본문이 너무 큽니다" (the request body is too large). I also wrote it in the 413 line of `docs/api.md`.
- (Optional) ID examples in the document: in Markdown the spaces around disappeared, so `7` looked like the valid ID `7`. I wrote it out as "`%207%20` with spaces around". I also corrected "starting with 1" to "not starting with 0".
- (Optional) Added 2 tests to `http-errors.test.ts`.
  - They check that `/api/health` and the backup route, which are registered earlier, are not hidden by the JSON 404. The backup route must reach the handler even when a broken body comes. They also check that a backup path that does not exist is 404 and that an invalid ID of a routine rest is 400.
  - They check that an ordinary request over 256kb is answered with the central 413 text.
- `tsx --test test/http-errors.test.ts test/api-contract.test.ts test/openapi.test.ts`: 13 pass. eslint and prettier passed
