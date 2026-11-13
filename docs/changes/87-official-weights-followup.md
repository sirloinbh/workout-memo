# #87 Research and fill in the machine values that have no official empty-weight

- Issue: [#87](https://github.com/sirloinbh/workout-memo/issues/87)
- Branch: `research/87-official-weights-followup`
  - It started on top of `feat/86-weight-step`. This keeps the migration number order (010 → 011 → 012 → 013).
  - The merge order must be #91 → #92 → #94 → this PR.

## Decisions — 2026-10-21

- The research targets are all 28 rows that #29 left as `unverified` (Hammer Strength 16, Arsenal Strength 11, Newtech 온힘 (Onhim) 1).
- If there is no official source, an unofficial measured value is shown separately from the official values as "reference (unofficial)".

## Research

- Two sub-agents did the web research in parallel, by brand. The main agent looked up 4 results again on the manufacturers' pages (Hammer Reverse V-Squat and Pullover, Arsenal Glute Bridge and ISO Conv Shoulder Press) and confirmed that the numbers and the per arm notation were the same.
- Results
  - Hammer Strength: official values confirmed for 15 rows. They are based on the Life Fitness catalog spec table.
  - Arsenal Strength: official values confirmed for 11 rows. The official site is `myarsenalstrength.com`. The `arsenalstrength.com` in #29 was an unrelated gym.
  - 2 rows stay unverified
    - Assisted Nordic Ham: the official value is an assisted load (Starting Assistance 18 lb), not a starting resistance.
    - Newtech 온힘 (Onhim): it is a pin (stack) line, and the official detail has only the maximum stack weight. The catalog PDF could not be checked because direct download was blocked.
- Unofficial values: for the 2 rows with no official value, I could not find specific numbers from sellers or communities. So I did not create a field or display to store unofficial values. This policy is recorded in the document. I did not write in the notes the 3 cases where the seller's value matched the official value (only the official value is adopted).
- Detailed table and the reasoning: [machine-official-weights-followup.md](../machine-official-weights-followup.md)

## Change

- `database/migrations/013_official_weights_followup.sql`
  - It runs `UPDATE` by the key (brand, lineup, model, setting) on only the 28 rows that 009 left unverified.
  - It changes 26 rows to the `verified` value, the original unit, the kg conversion, the basis, and the source, and updates the unverified reason of 2 rows.
  - There is no new row `INSERT` and no change to user machines or sets. The result is the same when re-run.
- `docs/machine-official-weights-followup.md` (new), and I added a link to the follow-up research in `docs/machine-official-weights.md`. The existing table stays as the #29 result.
- `backend/test/official-weights.integration.test.ts`
  - If only 009 is run again, the 013 result in the shared test DB is reverted. So I changed the re-run verification to run in the order 009 → 013 (the real deployment applies the files once each, in order).
  - For the unverified example row, it picks any unverified row instead of Arsenal.

## Tests

- I added 3 checks for 013 to `backend/test/official-weights.test.ts` (run without a DB).
  - It touches only the unverified rows of 009, once each. There is no `INSERT` and no machine or set write.
  - `verified` values
    - The source is a manufacturer domain (lifefitness.com, myarsenalstrength.com), and seller domains are forbidden.
    - The lb → kg conversion is exact.
    - The per arm basis is used only when it is in the official notation.
  - Unverified rows have NULL and a reason. Nordic Ham is unverified because it is an assisted load.
  - The follow-up document table matches the migration values.
- DB integration (`official-weights.integration.test.ts`): even after a re-run, the user machine default weights and the set total weights are unchanged. After applying to the test DB, the counts by state were verified 53, conflict 1, and unverified 2.
- Screen display: I did not change the code that displays official reference values. The existing `frontend/src/official-weights.test.tsx` keeps verifying the `verified` and unverified display.

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 296 pass, 0 skip (including the DB integration)
  - Frontend 99 pass
  - Workers 162, skills 4, docs 3, and build pass
- `npm run test:e2e` (the same test DB): 4 passed
- Right after I first applied 013, 3 integration tests failed. The test ran only 009 again and reverted the update. After fixing the re-run order, it passed.

## Limits and follow-up

- The Newtech 온힘 (Onhim) catalog PDF could not be downloaded directly. If the user has the catalog, it can be checked again.
- For Abdominal / Oblique Crunch, the official value is "25 lb + 10% of the user's body weight". Only the fixed part is kept as the value.
