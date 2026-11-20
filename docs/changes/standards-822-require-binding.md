# Require one-call claims in the AI tool routes (project-standards#822)

`registerToolRoutes` now runs with `requireBinding: true`: a call token from shared-ai must name the tool it is used for (`@list` for the list) and carry a `jti` the app has not seen. A token without those claims, for another tool, or used twice is a 401.

## Change

| File                                        | Content                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `backend/src/app.ts`                        | `requireBinding: true`                                                                         |
| `backend/test/ai-tools-binding.test.ts`     | New, no database: an unbound token, a token for another tool, and a replayed token are refused |
| `backend/test/ai-tools.integration.test.ts` | Test tokens carry `tool` and `jti`                                                             |

## Why now

The shared-ai deploy of the signer that adds `tool` and `jti` (shared-ai#21) is running on the server (`fb5176d`), so the strict mode no longer locks out shared-ai.

## Checks

- `tsx --test test/ai-tools-binding.test.ts`: passed. `tsc`, ESLint, and Prettier on the changed files: clean.
- The integration test needs `TEST_DATABASE_URL` and is skipped without it, so its updated tokens were not run here.
- After the deploy: a live `list_workouts` call through shared-ai must still answer.
