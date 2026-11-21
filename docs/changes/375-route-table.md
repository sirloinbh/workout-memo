# Route table and lazy pages (#375)

All eight pages shipped in the entry chunk, pages were picked by `pageOf` conditionals, and the unknown-address redirect was a `useEffect`.

## Change

| File                         | Content                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`       | Page content is chosen by `<Routes>`/`<Route>` inside `<Suspense>` (skeleton fallback). An unknown address uses `<Navigate replace>`; the redirect effect is gone. `pageOf` stays only for the page chrome (title, menu, timer position). Pages preload when the browser is idle. |
| `frontend/src/pages.tsx`     | The eight pages as lazy chunks, plus `preloadPages`.                                                                                                                                                                                                                              |
| `frontend/src/lazy-page.tsx` | `lazyPage`: like `React.lazy`, but renders at once after the chunk was loaded, so a page never suspends twice.                                                                                                                                                                    |
| `frontend/src/test/api.ts`   | Preloads the pages with a top-level await, so tests render a page without a suspended first pass and need no edits.                                                                                                                                                               |

## Checks

- `npm run build -w frontend` emits one chunk per page (analysis, backup, body, routines, dashboard, journal, goals, machines).
- `npm run test -w frontend`: 87 files pass, no test file edited.
- `npm run check`: passes.
