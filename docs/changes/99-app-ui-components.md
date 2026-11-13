# #99 Build the screen elements that are not in the shared components

- Issue: [#99](https://github.com/sirloinbh/workout-memo/issues/99)
- Branch: `feat/99-app-ui-components`

## Purpose

Prepare the elements needed for the screen replacement (#101 to #105) that are not in the shared components. Among the #99 candidates, Select, Card, Checkbox, Toast, EmptyState, and Sheet have been in `components/ui` since #159.

## Change — feat: app-specific components

I added them to `frontend/src/components/`. `components/ui` is a centrally managed file, so they cannot go there. There is no new npm package, and they use the ToggleGroup and Switch of the already installed `radix-ui` 1.7.0.

- `SegmentedControl`: pick one. Pressing the current item again does not clear the selection.
- `ToggleChips`: pick several.
- `Switch`: a setting that applies immediately.
- `NumberInput`: − + buttons and an input field. `stepValue` in `number-step.ts` removes decimal error and fits to the minimum and maximum.
- `List`, `ListItem`: the record list.
- I wrote usage examples and rules in `docs/design-system.md`.

I did not change the screens. As the issue scope says, they are replaced in #101 to #103. Combobox is built in #124 if needed.

## Tests

`segmented-control.test.tsx`, `toggle-chips.test.tsx`, `switch.test.tsx`, `number-input.test.tsx`, and `list.test.tsx` in `frontend/src/components/` check the roles, names, states, and arrow-key focus movement. It is jsdom, so the real Tab order and Space and Enter behavior cannot be checked.

## Verification

- 5 new component test files: 19 pass, 0 fail
- `npm run typecheck -w frontend`, `npm run lint`, `npm run format:check`: pass
- `npm run knip`: no items related to the new files. The existing items remain as they are (only a warning in CI).
- Local `npm run check`: I could not complete it. It stopped because of low system memory. The full check is confirmed by PR CI.
- There is no screen change, so I did not do a browser check or update visual baselines.

## Change — fix: first review follow-up

- `ToggleChips`: it returns the result in the order of `options`, not in click order. The same combination of body parts is not saved as different arrays.
- `NumberInput`: when `readOnly`, the buttons are blocked too. A button at a limit is `aria-disabled`, so it does not lose keyboard focus. `aria-label` is decided only by `label`, and `inputMode` can be passed in.
- Tests: I added one-sided limits, read-only and disabled, empty values, chip order, and arrow movement.
- `docs/design-system.md`: I wrote that the arrows of `SegmentedControl` only move focus and you pick with Space or Enter.
- Findings I did not apply: the `role="list"` of `List` is forbidden by the lint rule `jsx-a11y-x/no-redundant-roles`, and I could not actually confirm the VoiceOver problem, so I did not add it. Exponent notation input, a jump on an out-of-range value, and `0x10` input are not realistic problems for kg and reps. The `disabled` and `aria-describedby` of `SegmentedControl` will be added if the screen replacement needs them.

## Review

- First review: I reflected it as the "first review follow-up" above.
- Second review: no follow-up items. There are no issues I split off.

## Limits and follow-up

- The new components are not yet used on any screen, so I could not check the contrast on dark screens with axe. I will check it in the e2e of the screen replacement (#101 to #105).
