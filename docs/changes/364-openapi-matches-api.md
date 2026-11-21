# Make the OpenAPI document and responses match the real API (#364)

## What was already done

The managed `backend/src/standard/openapi.ts` (z.toJSONSchema builder) already emits `anyOf: [enum, null]` for nullable enums, the cookie `securitySchemes` entry, and 401/429 on every signed-in route. The `router.stack` walk now lives only in the two tests, where the operation table is compared with the registered routes.

## Change

- `backend/src/routes/goals.ts`, `backend/src/routes/machines.ts`: list explicit columns with `::float8` casts (goals, machines, the official machine weights and their joined `official_raw_value` / `official_weight_kg`), so `GET /api/goals`, `POST /api/goals`, `GET /api/machines`, `POST` and `PUT /api/machines` and `GET /api/official-machine-weights` return numbers, not strings.
- `backend/src/openapi.ts`: the shared 503 text now covers both the sign-in service and "Web Push is not set up".
- `docs/openapi.json` regenerated.

## Tests

- `goals.test.ts` and `machines.integration.test.ts` assert numbers for `target_weight` and `base_weight` (also after create).
- `openapi.test.ts`: `feedback` accepts `null` in the document; the registered route list cannot silently be empty.

## Not done here

- Frontend `number | string` types and `Number(...)` calls (`frontend/src/app.tsx`, `body.tsx`) are in lane-3 files; they can be removed in a follow-up now that the API returns numbers.
- The nullable-enum and `securitySchemes` code is managed in project-standards and needed no change.

Merging this deploys to production.
