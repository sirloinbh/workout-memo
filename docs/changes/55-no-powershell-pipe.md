# #55 Prevent Korean text corruption in PowerShell pipe migrations and backups

- Issue: [#55](https://github.com/sirloinbh/workout-memo/issues/55)
- Branch: `fix/55-no-powershell-pipe`

## Problem

Windows PowerShell 5.1 changes the encoding when it sends text to or receives text from an external program through a pipe.

- **When sending**: it converts with `$OutputEncoding` (ASCII by default). If you apply 001 as `database/README.md` says with `Get-Content … | docker compose exec … psql`, `'기타'` (Etc) is added as a `'??'` brand (reproduced on 2026-10-19).
- **When receiving**: it interprets with the console code page (CP949, the default on Korean Windows). This was found additionally this time. `scripts/backup.ps1` receives the `pg_dump` output into a variable, so on a CP949 console `기타` is saved into the backup file garbled as `湲고?`. I reproduced it with the test DB (on a UTF-8 console it is normal, so it had not shown up until now).

## Change — 2026-10-20

- `scripts/backup.ps1`
  - It writes inside the container with `pg_dump -f /tmp/workout-backup.sql` and then takes the file out byte for byte with `docker compose cp`. The temp file is deleted in `finally`.
  - The script stays ASCII, because PowerShell 5.1 reads a `.ps1` without a BOM as ANSI.
- `database/README.md`
  - I changed the 6 per-file migration commands to run the file that compose mounts (`psql -f /docker-entrypoint-initdb.d/<file>`).
  - I changed the backup restore to the order `createdb` → `docker compose cp` → `psql -f` → delete the temp file.
  - I added the section "PowerShell 파이프를 쓰지 않는 이유" (why we do not use PowerShell pipes). It covers the cause, the recommended ways (`npm run db:migrate`, `backup.ps1`), and the query for broken rows (rows in brands and official_machine_weights that contain `?`, query only).
- `scripts/test/docs-commands.test.mjs` (new) and `npm run test:docs` (included in `npm run check`)
  - It looks in the `powershell`, `ps1`, and `pwsh` code blocks of the repo's Markdown for the patterns `| docker`, `| psql`, `| pg_restore`, and `Get-Content … | docker/psql`. It excludes the past records `docs/changes` and `docs/daily`.
  - It also tests the judging function itself: it catches the old pattern and allows `-f`, `cp`, PowerShell-internal pipes (`| Select-Object`), and bash blocks.
  - It checks that `backup.ps1` uses `-f` and `cp` instead of receiving into a variable, and that it is ASCII.

## Checks

| Check                                                                                                      | Result                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproducing the old way on a CP949 console (test DB)                                                       | `기타` → `湲고?`                                                                                                                                                    |
| Running the new `backup.ps1` on a CP949 console (only reads the local DB, the test file is deleted)        | `기타` is kept in the dump, and there is no `湲고`                                                                                                                  |
| Running the README commands in a separate compose project                                                  | No duplicates after re-applying 001 and 009 with `-f` (5 brands, including `기타`), 0 broken rows found, and after the `cp`→`-f` restore, `기타` and 39 Korean official reference rows are kept |
| `npm run test:docs`                                                                                        | 3 pass. Reverting to the README before the fix gives 1 fail (regression detection confirmed)                                                                        |
| Broken rows query on the user's local DB (read only)                                                       | brands 0 rows. The `official_machine_weights` table does not exist (009 not applied, `npm run db:migrate` needed)                                                   |

`npm run check` (including `test:docs`): **EXIT=0**. Result: backend 279, frontend 89, workers 212, skills 4, docs 3, all pass, with 0 fail and 0 skip.

## Boundaries

- I did not change or delete any data in the production or local DB.
- The bash pipes in the server's `deploy/` and `docs/deployment.md` run in Linux bash, so they are not affected. They are also excluded from the check (bash blocks).
