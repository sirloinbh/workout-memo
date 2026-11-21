# Recorded Jev fixtures for the body record form checks (project-standards#933)

The judged checks in `e2e/ai-judge.spec.ts` (project-standards#574, ADR-0028) had no recording, so every CI run skipped them with `jev-fixture-missing`. This change adds the two recorded answers, so CI now replays them and the judged checks count.

## Change

| File                              | Content                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/fixtures/jev/56bdd151….json` | The empty-save alert ("Enter at least one of weight, body fat, or skeletal muscle mass"): `tells_what_to_enter` yes 0.93, `tone` actionable (confidence 1.0) |
| `e2e/fixtures/jev/972c041a….json` | The hint ("Only one record is saved per date. … at least one is required."): `explains_rules` yes 0.96                                                       |
| `e2e/ai-judge.spec.ts`            | Comment only: the key alone records now (project-standards#932)                                                                                              |

## How they were recorded

- One local run of `npm run test:e2e -- e2e/ai-judge.spec.ts` against a throwaway Postgres container migrated with `db:migrate`, with the key read from SSM into the test process only (never printed or written). Route: the vendor API, model `jev-latest` (the helper default since project-standards#932).
- Paid Jev calls: 2 (730 input tokens in total).
- Every answer agrees with the expectation in the spec.
- The fixtures hold only the request (the page text and the questions) and the answer; no key or header.

## Checks

- Offline replay (no key) with the new managed `e2e/support/jev.ts` (arrives in the sync PR #416): the test passes with no `jev-fixture-missing` annotation.
- With the old helper the hash differs (it sent the OpenRouter model name), so this PR merges after #416.
