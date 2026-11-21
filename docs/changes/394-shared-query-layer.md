# Use the shared query layer (#394)

The blocker, project-standards#788, shipped `lib/query.ts` (`createQueryClient`, `useApiQuery`, `useApiMutation`).

## Change

| File                                                         | Content                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`                                       | The local `new QueryClient(...)` is `createQueryClient(...)`. This app's choices stay as overrides: no retry, no refetch on focus or reconnect, `staleTime: 0` (the shared default would retry once and keep data fresh for 30 s, which changes what the screens show after a failure or a write). The goals, machines and brands loads are `useApiQuery` (same query keys as before, so every invalidation still matches). |
| `frontend/src/routines.tsx`, `frontend/src/cardio-goals.tsx` | Their plain GET queries (plans, weight steps, machines, cardio goals) are `useApiQuery`.                                                                                                                                                                                                                                                                                                                                    |

## Not changed

- Queries that need `keepPreviousData` (analysis, body), a `.catch` fallback (cardio summary, official weights, body parts, exercise names) or a per-period key stay on `useQuery`: `useApiQuery` has no such options.
- Writes stay on the existing `useMutation` calls: they take a function (`action(fn, ...)`) and name their own invalidations, which `useApiMutation`'s `{ path, method, body }` request does not fit without changing every caller.
- A load error now reads "Cannot reach the server" (the central client's text) for the migrated queries, and their timeout is the client's 30 s default instead of 15 s.

## Checks

- `npm run test -w frontend`: 87 files pass, no test edited. `npm run check`: passes.
