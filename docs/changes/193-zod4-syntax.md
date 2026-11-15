# #193 Move the validation code to zod 4 syntax

- Issue: [#193](https://github.com/sirloinbh/workout-memo/issues/193)
- Branch: `chore/193-zod4-syntax`

## Purpose

This is step 1 of the central `sirloinbh/project-standards#386`. I move the code first so that this app does not break when the central repo raises `zod` to 4.6.7. The Dependabot alert for the security advisory GHSA-mrhx-c7xc-m3w5 is closed by that sync. It is not closed by this PR alone.

## Change — 2026-11-01

- `shared/contract.ts` and the backend files import from `zod/v4`. The installed 3.25.76 has this path, so I did not change the package or the lockfile.
- I moved `required_error`, `invalid_type_error`, and `errorMap` to `error`. `.finite()` does nothing in zod 4, so I deleted it.
- I moved the string length checks to `limitLength` (`.refine`). In zod 4, `.min()` and `.max()` also run when the type check fails if the input has `.length`, so a length message is added to `title: []`. The limit is kept in `.meta` and comes out in the OpenAPI document as it was.
- `backend/src/openapi.ts` reads `_zod.def` instead of `_def`. I did not use `z.toJSONSchema` because the shape of its result is different.
- The retry key is checked with `z.guid()`. `uuid()` of zod 4 rejects keys like `00000000-0000-0000-0000-000000000001`, so a key that was already in use could become a 400.
- I wrote `backup` of the restore request as `.optional()`. In 4.6.7, a `z.unknown()` field is rejected when it is missing, and an English error comes out instead of the Korean guidance.
- I moved the backup time to `z.iso.datetime({ offset: true })`. The array length limit (`.max()`) is as it was.

## Items that do not apply

- `z.record`, `.partial()`, `.merge()`, `.email()`, `.url()`, and `ZodError.errors` are not used. The 3.25.76 problem where `{"constructor":null}` becomes a 500 in `z.record` does not apply. I added a test that puts it into the 4 main write APIs and checks for a 400.
- There is no PATCH route, and no `.default().optional()` combination either. I check with a test that a missing optional field is not filled with a default.

## Comparison result

I compared the schema before the move (zod 3.25.76) and after the move with 12,489 inputs. After the move, I ran two: `zod/v4` (3.25.76) and `node_modules/knip/node_modules/zod` (4.6.7). The inputs put wrong values, empty values, large values, Infinity, and the `constructor` key (null, number, object) into every field.

| Category                                                          | 3.25.76 `zod/v4` | 4.6.7 |
| ----------------------------------------------------------------- | ---------------: | ----: |
| Pass/fail, parsed value, and message are all the same             |            3,434 | 3,453 |
| Only the default English zod text differs                         |            8,774 | 8,902 |
| Only the number of times the same message repeats differs         |               22 |    22 |
| The first message is the same and the later messages are fewer    |               10 |    10 |
| The English text differs and the cross-check messages also differ |              236 |    86 |
| Pass/fail differs                                                 |               13 |    16 |

There is no difference in the parsed value of an input that passed in either version. If a value changes, the fingerprint of the retry key also changes, so I checked this item separately. For every input the schema did not throw an exception.

**OpenAPI:** the result of `npm run openapi` is the same as `docs/openapi.json` down to the byte. The document made with 4.6.7 has the same content too.

## Responses that change

All of them are for invalid input, and they do not come out from the values the screens send.

**Default English zod text.** Where no Korean text is specified, the text changes to the one of zod 4. Only for the string length text, `limitLength` keeps the zod 3 text.

| Before                                                  | After                                                |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `Required`                                              | `Invalid input: expected number, received undefined` |
| `Expected string, received number`                      | `Invalid input: expected string, received number`    |
| `Number must be greater than or equal to 1`             | `Too small: expected number to be >=1`               |
| `Array must contain at most 6 element(s)`               | `Too big: expected array to have <=6 items`          |
| `Invalid enum value. Expected 'a' \| 'b', received 'c'` | `Invalid option: expected one of "a"\|"b"`           |
| `Unrecognized key(s) in object: 'x'`                    | `Unrecognized key: "x"`                              |
| `Invalid datetime`                                      | `Invalid ISO datetime`                               |
| `Invalid uuid`                                          | `Invalid GUID`                                       |

**Cases where the Korean text changes too.**

- When the integer check (`.int()`) fails, the later checks stop. The response for `reps: 0.5` goes down from the same message twice to once, and the object-level cross-check message (for example `분할 개수를 확인하세요` (check the number of splits)) is gone.
- When another type that has `.length` comes to an array field, a length message is added. Example: `sets: ""` gets `세트를 1개 이상 입력하세요` (enter at least 1 set) after the English type message. I did not fix it so as to keep the array limit as it is.
- Infinity (`1e999`) is rejected in the type step, so the later `.refine` does not run. I matched the first message to be the same as before the move, and the message that used to follow is gone. Example: for weight only `체중은 유한한 숫자여야 합니다` (weight must be a finite number) comes out.
- Only in 3.25.76 `zod/v4`: if a date has a format error, `조회 종료일은 시작일 이후여야 합니다` (the query end date must be after the start date) is gone, and if a value inside `weeks` or `cycle` is out of range, a message like `1~12주차 목표를 입력하세요` (enter goals for weeks 1 to 12) is added. In 4.6.7 this difference disappears.
- Only in 4.6.7: when `rest_days` is too long, `휴식 요일과 주당 운동 횟수를 확인하세요` (check the rest days and the number of workouts per week) is gone.

**Cases where the pass/fail changes.** It passed before and is now a 400.

- Integers over `Number.MAX_SAFE_INTEGER` (`id`, `brand_id`, `machine_id`, `version`, the id in the path). `brand_id`, `machine_id`, and the id in the path are values that would have failed before with a range error in the DB (judged by reading the code). The `id` of `workouts`, `goals`, and `routines` in a backup and the `version` of POST are not used, so they succeeded before. All ids of this app are `integer` columns, so a value the app made does not apply.
- The `+0900` format (an offset without a colon) of the backup time. 4.6.7 also rejects a format without seconds (`2026-01-05T01:02Z`, `2026-01-05T01:02+09:00`) and an offset out of range (`+24:00`). A backup that this app exported uses the `toISOString()` or `pg` Date serialization format, so it does not apply, but a backup edited by hand may be rejected.

## Verification

- `npm run format:check`, `lint`, `contract:check`, `typecheck`, `test:skills`, `test:docs`, `build`: passed.
- Backend tests: 215 passed, 35 skipped (DB integration tests left out by leaving `TEST_DATABASE_URL` empty, confirmed in CI).
- Frontend tests: with `--testTimeout 60000`, 178 passed and 4 skipped. With the default 5-second limit, even main before the move had 8 failures such as timeouts on this PC.
- `zodResolver`: `@hookform/resolvers` 5.9.1 accepts a `zod/v4` schema in the type check and in `forms.test.tsx`. I did not raise the package.
- Form types: `WorkoutInput` and `GoalInput` pass the type check. `z.coerce` is used only for the path id, so it has nothing to do with the forms.
- Frontend bundle: changed from 618.40 kB (gzip 190.86) to 613.24 kB (gzip 191.59).
- For 4.6.7 I only checked the comparison above and the OpenAPI document. The type check, `zodResolver`, and the full tests are confirmed with the CI of the central sync PR.
