# Guard the official-weight seed migrations and refresh the READMEs (#367)

## Change

- New migration `021_official_weights_check.sql`: fails the run when fewer than the 28 rows corrected by 013 exist. It is read-only, so it is safe to re-run.
- 009 and 013 are not edited: an applied migration file must stay unchanged (its checksum is recorded and `db:migrate` stops on a change), so a note inside them would break every deployed database. The warning that they run only through `db:migrate` (009 upserts the pre-013 values) is in `database/README.md` instead.
- `README.md`, `backend/README.md` and `database/README.md` now describe the shared sign-in, `npm run db:migrate`, and the agent merging after review (merge to `main` deploys).

## Checks

- `backend/test/migrations.integration.test.ts`: a clean run has the corrected row (`Plate Loaded Reverse V-Squat`, verified, 34.02 kg), and 021 raises "27 of 28 rows" after one row is deleted.
