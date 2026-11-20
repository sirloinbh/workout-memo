# Adopt the managed OpenAPI builder and createPool (project-standards#709, part 2)

- `openapi.ts` is only the operation table plus `buildOpenApi(...)` from the managed `standard/openapi.ts` (`z.toJSONSchema`); the hand-written Zod walker is gone. Summaries are copied from the descriptions in `docs/api.md`; the Idempotency-Key header (`headers`) and the two text/csv exports (`produces`) use the options added in project-standards#844.
- `test/openapi.test.ts` compares the table with the registered routes and keeps the checks for sets, goals, the CSV type and the header; `zod4-syntax.test.ts` uses the managed `schemaOf`.
- `openapi-cli.ts` is the one-line entry to the managed CLI.
- `src/pool.ts` is removed: `server.ts` uses the managed `createPool(new Pool(...))`, which also listens on checked-out clients.
- `docs/openapi.json` is regenerated: it gains the shared sign-in security scheme and the default 401, 413 and 429 responses.
- Verification: typecheck, eslint, prettier, non-DB tests (284 pass). DB tests run in CI.
