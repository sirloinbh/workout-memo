# project-standards#357 Update visual baselines for the cn() text style fix

## Change

- `e2e/__screenshots__/ui-visual.spec.ts/`: updated 22 baselines at 768px and 1280px from the CI `visual-baselines` artifact.

## Reason

- The central `cn()` fix brought the current item's text in the left menu back to the same `text-body-sm` size as the other items.
- Before, `text-sidebar-accent-foreground` cleared the font size, so only the current item looked larger.

## Verification

- Compared `dashboard-1280` before and after and confirmed that only the menu text size differs. The other 21 were checked by the pixel difference ratio (1% or less) and the CI result.
- The 22 baselines at 360px and 390px are unchanged.
