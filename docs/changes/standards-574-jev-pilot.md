# Judged e2e checks for the body record form (project-standards#574, pilot)

`e2e/ai-judge.spec.ts` uses the managed Jev helper (`e2e/support/judged.ts`, project-standards ADR-0028) on the body record form: three judged questions about the validation error and the hint text.

## Change

| File                   | Content                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/ai-judge.spec.ts` | Opens `/body`, saves an empty form, and asks Jev whether the error tells the user what to enter, whether its tone is actionable, and whether the hint explains that one value is required. Only the message and the hint text are judged, so the request is the same on every run |

## How it behaves

- Without `JEV_API_KEY` and `JEV_API_URL` the recorded answers in `e2e/fixtures/jev/` are replayed. **No recording exists yet** (the Jev key, project-standards#573, is a user step), so CI shows the annotation `jev-fixture-missing` and the checks are skipped; the test still checks that the page and the alert work.
- With the key and URL set, a local run calls Jev, records the fixtures, and a confident wrong answer (0.9 or more) fails the test. The new `e2e/fixtures/jev/*.json` files are then committed.

## Checks

- ESLint, `tsc -p e2e/tsconfig.json`, and Prettier clean on the new spec. The spec was not run here: this PC has no workout-memo test database; CI runs it.
- Not done: a run with the real key and the recorded fixtures (needs #573).
