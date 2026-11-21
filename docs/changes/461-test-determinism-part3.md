# Test determinism, part 3 (#461)

Finishes the leftovers of #380.

## Change

| File                                     | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/test/fake-timers.ts` (new) | `fakeClock`, `settle`, `waitForFake`, `installFakeTimerHarness`: fake `Date` and the app's timeouts from the first line of a test. With `setTimeout` faked, Testing Library's asyncWrapper (it drains with a `setTimeout(0)`) hangs every `waitFor`, `findBy` and user-event call, and TanStack Query's `setTimeout(0)` never delivers results. The harness swaps in a pass-through asyncWrapper and `waitForFake` fires the timeouts that are due now without moving the clock. |
| `frontend/src/set-completion.test.tsx`   | Fake timers from the start; `userEvent.setup({ advanceTimers })`; the mid-test switch to fake timers and its `fireEvent` workaround are gone.                                                                                                                                                                                                                                                                                                                                    |
| `frontend/src/routines.test.tsx`         | Whole-screen `ui.text()` regexes replaced by `ui.shows()` element lookups (21 assertions); scoped `ui.text(element)` reads stay.                                                                                                                                                                                                                                                                                                                                                 |

## Checks

- Frontend suite 5 runs in a row, one at a time, free RAM above 5 GB: 87 files and 534 tests passed every time (7 skipped as before).
- `npm run check` passed (rc=0).
