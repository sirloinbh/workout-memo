# #283 Show "1 week" on the analysis period picker

## Problem

The analysis screen's period picker built every label as `${n} weeks`, so the first option read "1 weeks". This came from the English screen translation (#277).

## Change

- `frontend/src/analysis.tsx`: the label is "1 week" when `n` is 1, and `${n} weeks` otherwise.
- Regenerated the analysis visual baselines (`e2e/__screenshots__/ui-visual.spec.ts/analysis-*.png`) from the CI `visual-baselines` artifact.

## Checks

- `npm run test -w frontend -- src/analysis`: see the PR.
- CI e2e-visual compares the new baselines.
