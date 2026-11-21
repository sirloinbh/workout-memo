# Test determinism, part 2 (#380)

Second part of #380 (part 1 was PR #441).

## Change

| File                                         | Content                                                                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/routines.test.tsx`             | `vi.setConfig({ testTimeout: 60_000 })`: the editor tests take 1-5 s alone and hit the shared 15 s limit once under load. The managed vitest config is unchanged. |
| `frontend/src/workout-draft.test.tsx`        | Whole-body `textContent` regex assertions replaced by `screen.queryAllByText` lookups on the element that shows the text.                                         |
| `frontend/src/analysis.test.tsx`             | Same replacement for the page-wide text assertions. Assertions scoped to one card or row are unchanged.                                                           |
| `frontend/src/loading-placeholders.test.tsx` | Every mocked endpoint answers with its documented shape (`/api/routine-progress` is `{ routine: null }`, not `[]`).                                               |

## Not done

- `set-completion.test.tsx` with fake timers from the start: faking `setTimeout` for the whole test made `waitFor` / `findBy` hang (the run did not finish in 2 minutes), so it stays as is. It needs a shared helper in `frontend/src/test/` (lane-3 path); left open in #380.
- `routines.test.tsx` `ui.text()` joined-text assertions: left, they read scoped regions or the whole routine screen and need a larger rewrite.
- "Passes 5 runs in a row" was not run.

## Checks

- `vitest` for workout-draft, analysis and loading-placeholders: 42 passed.
