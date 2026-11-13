# #68 Generate OpenAPI docs from the routes and Zod schemas

- Issue: [#68](https://github.com/sirloinbh/workout-memo/issues/68) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), remaining work of step 2)
- Branch: `docs/68-openapi`. Stacked on #66 (PR #67). The merge order is #59 → #61 → #63 → #65 → #67 → this PR.

## Purpose

The REST contract existed only as a table for people (`docs/api.md`) and the shared Zod contract. There was no OpenAPI document that tools can read.

## Change — 2026-10-20

- `backend/src/openapi.ts`
  - `jsonSchema`: converts only the Zod v3 types the API uses into JSON Schema.
    - Supported types: object, string, number, boolean, array, enum, nullable, optional, default, effects, and unknown.
    - If it meets an unsupported type or check condition, it stops with an error.
    - There is no new package. The `toJSONSchema` of Zod v4 cannot be mixed with v3 schemas, and error handling (`instanceof ZodError`) would also have to change, so I did not use it.
  - `operations`: a table that defines, for each of the 30 routes, the request body schema, the query parameters, the status codes, the response format, and the retry key header.
  - `buildOpenApi`
    - It reads the actually registered Express routes. If they differ from the table, it stops with an error.
    - It builds the path variables (`{id}` is an integer of 1 or more, `{date}` is a date format), the query parameters, the request bodies (`components.schemas`), and the common error `Error { error }`.
  - `routeDescriptions`: uses the descriptions in the `docs/api.md` table as the summary of each operation.
- `backend/src/openapi-cli.ts` and `npm run openapi`
  - It generates `docs/openapi.json`: 22 paths, 30 operations, and 9 schemas.
  - The generated file is put in `.prettierignore` so the generator output is compared as it is.
- To use them in the operations table, I named and exported the existing inline query schemas: `analysisQuery` (routes/analysis.ts), and `exportQuery` and `restoreRequest` (backup.ts). The validation behavior does not change.
- I updated `docs/api.md` (change procedure step 4 and the OpenAPI section) and AGENTS.md (the API route change rules).

## Tests

`backend/test/openapi.test.ts` (4 tests):

- The committed `docs/openapi.json` equals the result generated from the current routes, schemas, and descriptions. If it differs, it fails and points to `npm run openapi`.
- The number of registered routes equals the number of operations, and every operation has a summary. It also checks the path variables `id` and `date` and the date pattern.
- The journal and goal schemas keep the server constraints.
  - Journal: required fields, 1 to 200 sets, total weight 0 to 99999, reps an integer from 1 to 1000, RPE allows null and has a default, and completed defaults to true
  - Goal: required fields
- An unsupported Zod type (`z.date()`) and a route that is not in the table stop with an error.

Run results (Node 24.21.0, dedicated test DB):

| Check                       | Result                         |
| --------------------------- | ------------------------------ |
| `npm run check`             | **EXIT=0**                     |
| Backend node:test (with DB) | **279 pass / 0 fail / 0 skip** |
| Frontend Vitest             | 89 pass / 0 fail              |
| `docker build ./backend`    | Success                        |

There is no screen change, so I did not run e2e again (2 passed as of the earlier PR #67).

## Limits and follow-up

- There are no response body schemas, because response Zod schemas are not defined. The response format follows the descriptions in `docs/api.md`.
- The refine rules (end date ≥ start date, RPE in 0.5 steps, routine week and split rules, and body record to two decimal places) do not appear in the JSON Schema.
- It does not provide a screen that displays the document, like Swagger UI.
