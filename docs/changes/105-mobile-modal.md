# #105 Mobile input flow, step 2: mobile modal, save button fixed at the bottom, keyboard covering

- Issue: [#105](https://github.com/sirloinbh/workout-memo/issues/105)
- Branch: `feat/105-mobile-modal`
- Earlier step: [step 1 set cards](105-set-cards.md) (#232)

## Purpose

When writing a journal on a phone, the user should not have to scroll to the end of a long form to find the save button, and the on-screen keyboard should not cover the field being typed in or the save button.

## Change — feat: mobile modal and save button fixed at the bottom

- `frontend/src/components/modal.tsx`
  - Added `layout` to `Modal`. The look changes only below 640px (`sm`); above that it is the centered card as now.
    - `sheet` (default): a bottom sheet attached to the bottom of the screen. Only the top corners are rounded and the width is the full screen. It is used for short forms such as the goal and machine forms.
    - `full`: fills the whole screen. It is used for journal edit.
  - In both looks the bottom edge stops at `--keyboard-inset` (the height the on-screen keyboard covers). It listens to `resize` and `scroll` of `visualViewport` to change this value, and when the keyboard comes up and the modal gets shorter, it makes the field being typed in visible again with `scrollIntoView({ block: 'nearest' })`. On both iOS and Android Chrome, when the keyboard appears the whole screen (layout viewport) stays the same and only the visible area (visual viewport) shrinks, so that difference is treated as the keyboard height.
  - Gave the modal scroll area a `scroll-padding-bottom` (96px) so that when the browser scrolls a field into view it does not hide behind the save button at the bottom.
  - New `ModalFooter`: an area stuck to the bottom of the modal (`sticky bottom-0`). It has a top border and a background so the form passes behind it. It leaves bottom padding for the iPhone home indicator area (`safe-area-inset-bottom`).
  - The shared `components/ui/dialog.tsx` is a centrally managed file, so it was not edited, and only the classes that `Modal` passes were changed.
- `frontend/src/components/keyboard-inset.ts`: the keyboard height calculation `keyboardInset(innerHeight, visualViewport)`. It counts only the height hidden below the visible area (it subtracts the `offsetTop` by which the visible area is pushed up, and negative values become 0).
- `frontend/src/app.tsx`: the journal edit modal opens with `layout="full"`, and the "기록 저장하기" ("save record") button is in `ModalFooter`.
- Screen difference: below 640px, journal edit becomes full screen and the goal and machine forms become bottom sheets. The save button of journal edit stays visible at the bottom of the screen while the form scrolls. At 768px and wider the modal look is unchanged, and only the journal edit save button is attached below the modal (see the first review follow-up).

## Tests

- Added: 3 tests in `frontend/src/components/modal.test.tsx`
  - That `keyboardInset` gives the right values for no keyboard, a 336px keyboard, the visible area pushed up, and negative values
  - That when `visualViewport` shrinks, the `--keyboard-inset` of the modal changes and the field being typed in is shown again, and that closing removes the events
  - That the default look is `sheet` and `ModalFooter` is inside the dialog
- Added: 2 "390px mobile modal" tests in `e2e/ui-responsive.spec.ts`. They check that journal edit fills the whole 390x844 and that the save button is visible within the bottom 80px of the screen at the start, in the middle, and scrolled to the top, and that the goal form is a full-width sheet attached to the bottom of the screen. They run in CI.
- `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx src/set-completion.test.tsx src/forms.test.tsx`: 39 pass
- `npm run typecheck -w frontend`, eslint of changed files (`--max-warnings 0`) and prettier: pass
- Not run: e2e and the local `npm run check` were not run because of low memory. Visual baselines, axe, responsive, and touch are checked by the PR CI. It was not checked with a real phone keyboard (Playwright does not bring up the on-screen keyboard). The keyboard behavior was verified only by the `visualViewport` imitation in the unit tests above.
- Expected baseline change: fixed in the first review follow-up.

## Change — fix: first review follow-up

The first review had 1 required and 3 recommended items, and all were applied.

- Required 1: `ModalFooter` applies regardless of screen width, but the record said "768px and wider does not change" and that 6 baselines were expected. At 768 and 1280px the journal edit form is also longer than the modal, so the save button sticks below the modal. On desktop too the user can save without scrolling to the end, which is the intended behavior, so the record was corrected. The expected baseline change is 8 images: 6 for `workout-editor`, `goal-editor`, and `machine-editor` at 360 and 390px, and 2 for `workout-editor` at 768 and 1280px.
- Recommended 2: pinch zoom also shrinks the visible area, and moving the screen while zoomed changes `offsetTop`. So just zooming was mistaken for a keyboard, which made the modal height jitter and `scrollIntoView` repeat. When `visualViewport.scale` is above 1.01, the keyboard height is treated as 0.
- Recommended 3: the unit test also checks that the `scroll` listener is removed.
- Recommended 4: changed all the e2e coordinate comparisons to `toBeCloseTo(..., 0)` so they do not wobble on fractional pixels.
- Added test: 1 case of zoom (`scale: 2`) for `keyboardInset`
- After the follow-up: `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx` 27 pass, typecheck, eslint, and prettier pass

## Change — fix: second review follow-up

The second review confirmed that all 4 first review remarks were applied, and raised 1 required and 2 recommended items. Two reviews are done, so there is no third review.

- Required (not applicable, no change): the remark that "modal input fields inherit the 11px of `.modal label`, so iOS auto-zooms on focus, and then `scale > 1.01` turns the keyboard handling off". On touch screens (`pointer: coarse`), the #104 rule in `style.css` sets inputs, selects, and multi-line fields inside `.legacy` to 16px. The modal carries the `legacy` class, so no auto-zoom happens on phones. That keyboard handling turns off when the user zooms by hand and then opens the keyboard is an intended limit (while zoomed, the keyboard and the zoom cannot be told apart).
- Recommended 1: what used to scroll back to the field being typed in on every `scroll` of `visualViewport` while the keyboard is open now happens only when the keyboard height grows. It does not pull against the user's scrolling. Added a check to the unit test that it does not scroll again on a `scroll` event after the keyboard opens.
- Recommended 2: updating the baselines is done after seeing the CI result (see the visual baselines below).
- After the follow-up: `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx` 27 pass, typecheck, eslint, and prettier pass

## Visual baselines

- In CI for head `2c7a2ef` (run 42432279662), `e2e-visual` failed only the 8 images that were expected: `workout-editor`, `goal-editor`, and `machine-editor` at 360 and 390px, and `workout-editor` at 768 and 1280px. The 2 new e2e "390px mobile modal" tests and the responsive and horizontal overflow checks passed.
- The actual images were checked. At 390px journal edit fills the whole screen and the save button is attached at the bottom. The goal form is a full-width sheet attached to the bottom of the screen. At 768 and 1280px journal edit keeps the modal look and only the save button is attached below the modal.
- These 8 images were updated with the `visual-baselines` artifact of the same run.
- The artifact also held 4 different `routines-*` images. The PR CI runs with the latest main merged in, so what was captured is the screen of #233 (routine form), which entered main in the meantime. It is not a change of this PR, so it was not included, and origin/main was merged next to receive main's baselines.

## Merge main

- #233 (routine form) and #236 (InBody preview) entered main and changed `style.css` and `e2e/**`, so origin/main was merged by the merge rule. There were no conflicts. Neither change uses `Modal`.
- After the merge: `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx src/routines.test.tsx` 35 pass, typecheck passes
- Second merge: after CI passed, #238 (routine plan view) and #239 (exercise analysis period row) entered main and changed `style.css` and `e2e/**`, so it was merged again. There were no conflicts and neither change uses `Modal`. After the merge `src/components/modal.test.tsx src/workout-draft.test.tsx` gave 27 pass and typecheck passed
- Third merge: #240 (cleanup of unused styles) and #241 (exercise analysis list and detail) entered main. `app.tsx` overlapped and `style.css` and `components/**` changed, so it was merged again. There were no conflicts. Confirmed that the touch screen input 16px rule (`@media (pointer: coarse)`), which is the basis of the second review judgment, is still there. After the merge `src/components/modal.test.tsx src/workout-draft.test.tsx src/set-completion.test.tsx` gave 36 pass, and typecheck and eslint passed
