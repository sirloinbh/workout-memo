# #101 Replace the feeling feedback with ToggleChips (step 4)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-feedback-chips`

## Purpose

This is the fourth PR in #101, which moves one element at a time. The feeling feedback is the last element that used `.tabs`. It becomes `ToggleChips`, and the `.tabs` rules are removed. This PR does not close #101.

## Change — feat: replace the feeling feedback

- `frontend/src/app.tsx`: the feeling feedback in the journal editor is now `ToggleChips`. The caller keeps the pick-one rule. Pressing another value switches to it, and pressing the selected value again clears it. This is the same as before.
- The group name changes from `체감 피드백 (선택)` (feeling feedback (optional)) to `체감 피드백` (feeling feedback). The `aria-pressed` of each chip is unchanged. Arrow keys move between chips.
- `frontend/src/style.css`: removed `.tabs`, `.feedback-field`, and the related responsive and contrast rules.
- `docs/design-system.md`: documented this use of `ToggleChips`.
- The look changes from tabs to rounded chips, and the selected chip has the primary color as its background.

## Change — fix: first review follow-up

- Focus indicator: in dark mode, `ring/50` has a contrast of about 1.9:1 (reviewer's calculation), so keyboard focus is hard to see. `ToggleChips`, `SegmentedControl`, and `Switch` now use `ring-ring`. The contrast is about 4:1, which passes the 3:1 bar (calculated from the token values, not measured on screen).
- The central shared components (`Button` and others) also use `ring/50`. They are centrally managed files, so they were not fixed here.
- While saving, the Radix group's `tabIndex=0` can make Tab stop once at an invisible place. The value does not change, so this was left as is.
- Removed an obsolete `style.css` comment.

## Tests

- `frontend/src/set-completion.test.tsx`: added a check that only one value remains when another is pressed.
- Updated 2 visual baselines: the journal edit modal at 768px and 1280px, where the feeling feedback is visible. Both CI failures were these visual regressions, and the other 76 checks, including axe, passed. I looked at `workout-editor-1280` directly.
- I did not run the full local `npm run check` because it has a history of running out of memory. e2e is checked by PR CI.
