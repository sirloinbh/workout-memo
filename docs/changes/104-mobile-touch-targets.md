# #104 Match input text and press areas on touch devices

- Issue: [#104](https://github.com/sirloinbh/workout-memo/issues/104)
- Branch: `fix/104-mobile-touch-targets`

## Purpose

iOS zooms the screen on focus when the input text is smaller than 16px. The inputs and buttons on the existing screens were small for touch (for example `.date-control input` at 11px). The shared components already meet the standard.

The user decided to go without a bottom tab bar (issue comment, central `docs/layout.md`). Navigation below 768px keeps using the shared Sheet menu. The safe area and `viewport-fit=cover` are already in `AppShell` and `index.html`.

## Change — fix: apply the touch device standard

- `frontend/src/style.css`: added an `@media (pointer: coarse)` rule at the very end.
  - Inputs and selects: text 16px, height 44px or more
  - Multi-line input: text 16px. The height keeps the 80px of `.modal textarea`.
  - Buttons: height and width 44px or more. The delete button cell of `.set-editor` was also widened from 26px to 44px.
  - `summary`, link buttons (`a.primary`), and a `label` that holds a checkbox: height 44px or more
  - The checkbox in the InBody preview: it sits in the table without a label, so it was only enlarged to 24px. 44px is done in #103 when it is replaced with the shared `Checkbox`.
  - `.rest-timer .rest-actions button` was added separately because a more specific 40px rule exists. The new e2e caught it as "휴식 시작" ("start rest") at 40px.
  - `.form-grid`: stacks into one cell at 480px and below. Two 16px date input cells overflowed by 54px (at 360px width) inside the goal modal, which the strengthened e2e caught.
- It applies only to touch devices, so the visual baselines, which are taken without touch, do not change.

## Tests

- `e2e/ui-touch.spec.ts` (new): with touch emulation at 360, 390, and 768px, check the text size, the press areas, and horizontal overflow of the document and modals for 8 pages and 3 modals. It also checks `aria-current` of the menu and page navigation.
- Scope limit: only elements visible when the screen is opened are checked. Screens that open only after a click (routine form, body record form, InBody preview) are not checked. The follow-up issue is #198.

## Review

- First review applied: checkbox labels stacking vertically (`inline-flex`), the set delete button cell, link buttons, the InBody checkbox, and the overflow check inside modals.
- Second review: no follow-ups. Afterwards a CI failure led to an extra fix of `.form-grid`. It was a change after the second review, so no more review was done.
- Split out: extending the touch check to screens after a click (#198).
- Remarks not applied: internal horizontal scroll areas (`.table-scroll` and so on) are intended scrolling, so only the whole document and modals are checked.
