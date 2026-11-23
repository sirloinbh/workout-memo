# #470 Call setInt8Parser at startup

## Change

- `backend/src/app.ts`: calls `setInt8Parser(types)` from `./standard/db.js` next to the DATE parser, like the other 7 apps. A BIGINT now comes back as a number, and a value above 2^53 throws instead of being rounded (ADR-0025).
- `backend/test/int8-parser.test.ts`: the parser for type 20 returns numbers and rejects an unsafe integer.

## Reason

The adoption rule added in project-standards#1035 warned that workout-memo never called it.

## Check

- The BIGINT values the app reads are `row_number()` in the CSV export (`set_number`, passed through `num()`, so the CSV is unchanged) and the audit log ids. Every `count(*)` is already cast with `::int`, and there is no `sum()`.
- `npm run check`: see the PR.
