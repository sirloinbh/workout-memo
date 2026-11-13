# #29 feat: Reference table of official machine empty weights (starting resistance)

- Issue: https://github.com/sirloinbh/workout-memo/issues/29
- Branch: feat/29-machine-official-weights
- Confirmed scope (user comment, 2026-10-19): a table in the docs, and showing the official values on the app's machine selection screen

## Research method

- The targets are the Arsenal Strength, Hammer Strength, and Newtech (뉴텍) 온힘 (Onhim) lineups. Only the manufacturer's official product pages, catalogs, and manuals were accepted as official sources. Retailer, blog, community, and user-measured values were not used as official values.
- I made about 37 web lookups with WebSearch and WebFetch. The pages I fetched were treated as data only, and I did not download or run any files.
- Hammer Strength: found 41 models in the official Life Fitness en-us Plate-Loaded catalog. I looked up the `Product Code` and `Starting Resistance` directly on the product pages of 25 of them and recorded them. I could not look up the other 16 because of the research limit.
- Arsenal Strength: I could not find the manufacturer's official site. `arsenalstrength.com` was an unrelated gym site and `www.arsenalstrength.net` failed DNS lookup. I did not adopt the retailer's (Performaxx) figures.
- Newtech 온힘 (Onhim): `www.ntws.co.kr` returned HTTP 403 in both Korean and English. I could not confirm the existence of the Onhim lineup or its model list from official sources.
- Result: 56 researched rows (53 models). 28 rows with a confirmed official value (25 models; includes 1 Seated Biceps `conflict` row), and 28 unconfirmed NULL rows (Hammer 16, Arsenal 11, Newtech 1). There was no official 0 kg value. The detailed table and the criteria are in [docs/machine-official-weights.md](../machine-official-weights.md).

## Changes

- `database/migrations/009_official_machine_weights.sql`: added the `official_machine_weights` reference table. It has brand, lineup, model number, model name, official item name, setting, status, original value and unit, manufacturer's kg notation, kg conversion, basis, official URL, confirmation date, and a note.
  - CHECK constraints: a confirmed value requires a unit, kg, a basis, and an https source. An unconfirmed value is NULL (0 is forbidden) and requires a reason. A conflict row also requires a reason.
  - Added `machines.official_weight_id` as an optional link column (`ON DELETE SET NULL`).
  - The seed is idempotent with `ON CONFLICT ... DO UPDATE`. It does not change `machines.base_weight` or `sets.weight`.
- `backend`:
  - New endpoint `GET /api/official-machine-weights?brand=`: applies Zod strict validation and rejects an empty value, a duplicate value, an unknown parameter, and input longer than 120 characters with 400.
  - `GET /api/machines`: also returns the status, value, basis, source, and confirmation date of the linked reference value.
  - Machine POST/PUT: stores `official_weight_id` (a positive int4 or null, default null). A reference value that does not exist returns 400 for the FK violation.
- `frontend/src/main.tsx`, `style.css`:
  - Machine create and edit screen: you can pick an "공식 참고값 (선택)" (Official reference value (optional)) for the selected brand. It shows the value, basis (one side / basis not stated), model number, official item name, manufacturer's kg notation, official source link, confirmation date, and note, and says "기본중량에 자동 반영되지 않습니다" (It is not automatically applied to the base weight).
  - An unconfirmed value is shown as "공식값 미확인" (Official value unconfirmed), and a conflict row as "공식 자료 간 불일치" (Mismatch between official sources). Changing the brand clears the link to another brand's reference value.
  - The machine library rows and the machine selection items in the log show the linked "공식 참고값" (Official reference value) separately from the user's base weight.
  - Even if the reference lookup fails, the log and machine data keep displaying, and a failure notice is shown in the form.
- `docs/machine-official-weights.md`: added the research criteria, method, scope, totals, and table. `database/README.md`: added how to apply 009.

## Tests

- `backend/test/official-weights.test.ts` (runs without a DB): parses the migration seed tuples and verifies the following.
  - The seed covers three brands, and Newtech includes only the Onhim lineup.
  - Every row that has a number has a lifefitness.com https source, a unit, a basis, and the manufacturer's kg notation, and the kg value equals the `lb×0.45359237` rounded result.
  - The per_arm basis is grounded in the official wording.
  - There is no retailer source.
  - Unconfirmed rows are NULL and have a reason.
  - The docs table and the seed match.
  - The migration does not update machines or sets.
  - It validates `official_weight_id`.
  - An invalid API query returns 400 before the repository is called.
- `backend/test/official-weights.integration.test.ts` (requires `TEST_DATABASE_URL`): verifies the following.
  - Reads reference values with their sources, and reads unconfirmed values as NULL with a reason.
  - DB constraints reject a row with no source, an http source, a row with no reason, and an unconfirmed 0 kg row.
  - Linking a reference value to a NULL, 0, or 20.25 kg machine preserves the base weight.
  - Re-running the migration twice leaves the machine base weights and past set total weights unchanged and the number of seed rows the same.
  - Values are preserved after changing or clearing the link and after rejecting a nonexistent reference value.
- `backend/test/official-weights-ui.test.ts` (existing vm render adapter method): verifies the following.
  - The library shows the official reference value, the source link, and the confirmation date, and the base weight stays "미입력" (Not entered).
  - The log's machine selection items show the official reference value together.
  - Even when a reference value is linked at registration, the base weight input stays empty, and the request body is `base_weight: null`, `official_weight_id: 11`.
  - An unconfirmed reference value is shown as "공식값 미확인" (Official value unconfirmed) and 0 kg is not shown. Changing the brand clears the link.
  - A reference lookup failure does not block the screen.
- The tests were written together with the implementation. I did not separately observe a failure before implementation.

### Actual run results

- The 2 new test files (`tsx --test test/official-weights.test.ts test/official-weights-ui.test.ts`): 12 pass / 0 fail / 0 skip.
- Full check (`issue-check.ps1 -Issue 29 -Migrate`, dedicated test DB `workout_test_29`):
  - First run: migrations 001 to 004 and 009 were all applied, but EXIT=1 from a Prettier warning on this document.
  - Second run: the same migrations succeeded again, but EXIT=2 from a type error (TS2345) in an assertion message of the new tests. I fixed the test messages with `String(...)`.
  - Third `-Migrate` re-run: could not run because the tool permission classifier denied it.
  - Final run: I ran `issue-check.ps1 -Issue 29` without `-Migrate`. The first attempt was EXIT=1 from a Prettier warning, and after fixing the warning it was EXIT=0. The 009 SQL has not changed since the run in which the migration was applied, and the integration test also re-applies 009 twice during the run.
- Final `npm run check` result: format, lint, and type checks succeeded, app tests **228 pass / 0 fail / 0 skip** (including DB integration tests; the new `official references are read ...` integration test also actually ran), agent tests **162 pass / 0 fail / 0 skip**, skills tests **4 pass / 0 fail / 0 skip**, frontend and backend builds succeeded.
- After updating this record, I ran `prettier --check .` over the whole repository: exit code 0. There are no code or test changes other than this sentence.

## Limits and follow-up

- The 16 Hammer Strength models are NULL because I have not yet looked up their official product pages. They can be looked up as a follow-up.
- I could not obtain official sources for Arsenal Strength and Newtech 온힘 (Onhim). Once the manufacturer's official site or catalog, or a recordable official answer, is obtained, the rows will be updated.
- The difference in the basis notation between en-us and en-eu for Seated Biceps has to be confirmed by looking up the en-eu page directly.
- Real browser layout, opening links, and mobile width checks are within the coordinator's browser verification scope.

## Review follow-up — 2026-10-19

- If `official_weight_id` is omitted in a machine PUT, the stored link is kept. An explicit `null` clears the link, and a number changes it. If omitted in POST, there is no link. I removed the Zod default null so a partial update does not erase the link.
- A nonexistent reference value ID is distinguished by the FK constraint name (`machines_official_weight_id_fkey`) and returns 400 `선택한 공식 참고값이 존재하지 않습니다` (The selected official reference value does not exist). Other FK violation messages were restored to the existing wording.
- I changed the 009 apply command in `database/README.md` from a pipe to running a file inside the container (`psql ... -f /docker-entrypoint-initdb.d/009_official_machine_weights.sql`). This is because the Windows PowerShell 5.1 pipe corrupts Korean into ASCII. The 002/004 instructions were left to a separate issue's scope.
- Regression tests:
  - `official-weights.test.ts`: added 1 HTTP test. It checks that omitting the field in PUT gives an update flag of false and null or a number gives true, that omitting in POST gives null, and that an FK violation in POST and PUT returns 400 and the Korean message. The schema test checks omitted = undefined and null = null.
  - `official-weights.integration.test.ts`: checks that the link is kept after a PUT that omits it, switching and clearing with null, 400, the message, no save, and the existing link kept for POST and PUT with a nonexistent ID, and that the base weight and past total weights are preserved at every step.
- Run: `issue-check.ps1 -Issue 29 -Migrate`. After applying migrations 001 to 004 and 009, EXIT=0. App tests **231 pass / 0 fail / 0 skip** (including DB integration), agent and skills tests, format, lint, type checks, and builds succeeded. Before that, I ran the 3 target test files (17 pass / 0 fail).
- Note: if an earlier run applied the migration through an ASCII pipe, a reference row with corrupted Korean may remain under a separate key in the dedicated test DB. It is test-DB only and did not affect the test results.

## Coordinator review and real-browser check — 2026-10-19

- Independent review (read-only, compared against 4 official pages): no blocking findings. Compared with the lifefitness.com official pages, Iso-Lateral Bench Press 7 lb one side, Hack Squat 125 lb one side, Linear Leg Press 118 lb (basis not stated → `unspecified`), and Iso-Lateral Kneeling Leg Curl 8 lb one side matched. The lb→kg recalculation (×0.45359237, 2 decimals) of every confirmed value is correct, and the docs table matches the SQL seed. 009 does not create duplicates when re-run, thanks to `UNIQUE … ON CONFLICT DO UPDATE`, and I confirmed `ON DELETE SET NULL`, no path that writes base weights or sets, and parameterized queries. The 2 P3 findings (clearing the link on a partial update, the wording of the error for a missing id) and the Korean encoding risk were handled in the `fix:` commit above.
- Test DB cleanup: from the earlier ASCII pipe apply, 1 corrupted duplicate Onhim row remained in `workout_test_29` (test DB only). After deleting it I applied 009 again in UTF-8, and confirmed 56 rows, 27 verified rows, the Korean in Onhim is correct, and no duplicates after the re-apply.
- Real browser (Playwright, dev server on the dedicated DB):
  - Mobile 390px machine registration: when Arsenal Strength is selected, all the reference candidates are "공식값 미확인" (Official value unconfirmed). Switching to Hammer Strength gives 44 candidates, and selecting "Iso-Lateral Bench Press — 7 lb = 3.18 kg · 편측" (one side) shows the source link (lifefitness.com) and the notice "기본중량에 자동 반영되지 않음 · 편측 값은 양쪽 합계 아님" (Not automatically applied to the base weight · a one-side value is not the sum of both sides). The base weight field is saved empty, giving `base_weight=null`, `official_weight_id=1`.
  - API: a PUT that omits the field keeps the link (200, id 1 kept), and a nonexistent id 999999 gives 400 "선택한 공식 참고값이 존재하지 않습니다" (The selected official reference value does not exist).
  - PC 1440px: the library row shows "공식 참고값(Iso-Lateral Bench Press): 7 lb = 3.18 kg · 편측 · 출처 (2026-10-19 확인)" (Official reference value (...): 7 lb = 3.18 kg · one side · source (confirmed 2026-10-19)), and the log's machine selection shows "아이소 벤치 (기본중량 미확인) · 공식 참고값 7 lb = 3.18 kg · 편측" (Iso bench (base weight unconfirmed) · official reference value 7 lb = 3.18 kg · one side). No horizontal scrolling.

## Newtech brand added — 2026-10-19

- At the user's request ("뉴텍도 추가해줘", add Newtech too), I added `INSERT INTO brands(name) VALUES ('Newtech') ON CONFLICT (name) DO NOTHING` to 009. It uses the `brands.name UNIQUE` constraint from 001. I store and show the name as `Newtech`, the same as the reference table's `brand`, to keep per-brand reference matching, and I did not put a new Korean literal in the SQL.
- Tests:
  - Integration test: after re-running 009 twice, checks that there is exactly 1 `Newtech` brand, that it is exposed in `/brands`, and that all the `?brand=Newtech` reference rows are Onhim, unverified, and NULL.
  - UI test: checks that Newtech appears in the brand tabs and in the brand choices of the registration form, and that on selection the reference-value choice is `온힘 · 온힘 라인업 (모델 미확인) — 공식값 미확인` (Onhim · Onhim lineup (model unconfirmed) — official value unconfirmed).
- Run: `issue-check.ps1 -Issue 29 -Migrate`. The first run was EXIT=1 from a Prettier warning on this document, and after the format fix the re-run was EXIT=0 (001 to 004 and 009 applied). App tests **233 pass / 0 fail / 0 skip** (including DB integration; the new Newtech integration and UI tests ran). Agent and skills tests, format, lint, type checks, and builds also succeeded.
