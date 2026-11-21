# Answer out-of-range ids, extra decimals, and bad references with 400 (#363)

## Change

- `shared/contract.ts`: every integer id and `version` in the workout and machine schemas has `.max(2147483647)`, so `machine_id: 3000000000` is a 400 instead of a database 500. Weights (`kg`) must have at most two decimals, like body metrics, because the columns are `numeric(7,2)`; `42.555` is no longer stored as `42.56`. `backend/src/contract.ts` is regenerated with `npm run contract:sync`.
- `backend/src/routes/shared.ts`: the generic `23503` branch that always said "The selected machine or brand does not exist" is gone. `sets_machine_id_fkey` says "The selected machine does not exist", `machines_brand_id_fkey` says "The selected brand does not exist", and every other foreign key falls through to the central neutral message ("A related item does not exist or is still in use").

## Tests

- `backend/test/contract.test.ts`: `machine_id`, `version`, `brand_id` of 3000000000 and weights such as `42.555` are rejected; `42.55` is accepted.
- `backend/test/http-errors.test.ts`: machine, brand, and an unrelated foreign key each get their own message.

Merging this deploys to production.
