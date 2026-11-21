# Deterministic screen tests, first part (#380)

Screen tests proved negatives with fixed 20 ms sleeps, and the fake `fetch` ignored an abort while its handler was pending.

## Change

| File                                                                     | Content                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/api.ts`                                                            | `mockApi` rejects a pending request as soon as its signal aborts (like a browser). New `flushRenders` settles renders with `act`, no timer. |
| `period.test.tsx`, `official-weights.test.tsx`, `workout-draft.test.tsx` | The fixed sleeps use `flushRenders`.                                                                                                        |
| `set-completion.test.tsx`                                                | `navigator.vibrate` is set with `vi.stubGlobal` (undone by the shared `afterEach`) instead of defineProperty/delete.                        |
| `inbody-import.test.tsx`                                                 | `ocr` is reset in `beforeEach`.                                                                                                             |
| `new-workout-defaults.test.tsx`                                          | Asserts the browsed reference date.                                                                                                         |
| `routines.test.tsx`                                                      | The either-UI branch is gone; the plan view is always opened with "View plan".                                                              |

## Not done here (left in #380)

- The mixed fake-timer regime in `set-completion.test.tsx` (`useFakeTimers` from the start needs `userEvent.setup({ advanceTimers })`).
- Joined-text and whole-body regex assertions in `analysis`, `routines` and `workout-draft` tests, and real response shapes in `loading-placeholders.test.tsx`.

## Checks

- `rg "setTimeout\(resolve, 20\)" frontend/src` finds nothing.
- `npm run check`: passed once. Two later runs failed (one unknown, one a 15 s timeout of a long `routines.test.tsx` test while other lanes loaded the machine); that file passes alone 3 of 3. The "5 runs in a row" criterion is not verified yet.
