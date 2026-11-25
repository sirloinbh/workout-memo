# Warm-up set suggestion (#480)

Each set card in the workout editor has a "Warm-up" toggle in the header row. It lists warm-up sets for the weight entered: 40% × 8, 60% × 5 and 80% × 3 of the working weight, each rounded to the 5 kg weight step.

## Decision (user, 2026-11-25)

Suggest only, nothing saved. There is no migration and no warm-up flag; the original tasks for the flag and for excluding warm-ups from volume, goals and records are dropped because nothing warm-up is stored.

## Rules

- A suggested set that rounds to 0, to the working weight or above, or to the same weight as the one before it is left out, so light weights get fewer sets.
- Only one panel (Warm-up or Plates) is open per card, and deleting a set closes it.

## Files

- `frontend/src/warmup.ts`, `frontend/src/workspace/warmup-panel.tsx`, `frontend/src/workspace/workout-editor.tsx`.
- Tests: `frontend/src/warmup.test.ts`, the warm-up case in `frontend/src/plate-calculator.test.tsx`.

## Checks and visual baseline

See the PR. The header row of the set card gains a second button, so the workout-editor baselines are expected to change and are refreshed from the CI artifact.

## Visual baseline

One file updated, `e2e/__screenshots__/ui-visual.spec.ts/workout-editor-768.png`: the set card header now has a "Warm-up" button beside "Plates". The other editor shots (360, 390, 1280) did not change.
