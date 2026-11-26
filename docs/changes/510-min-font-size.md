# #510 Raise the 11px text to the 12px minimum

- Issue: https://github.com/sirloinbh/workout-memo/issues/510
- Branch: fix/510-min-font-size

## Changes

`.subtle-button`, `.modal label` and `.form-hint` in `frontend/src/style.css` use 12px instead of 11px (central standard, project-standards#1127 and #1135).

## Verification

`npm run check`; visual baselines refreshed from the CI artifact if they changed.
