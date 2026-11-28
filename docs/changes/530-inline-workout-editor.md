# #530 Open the workout editor inline on the page

- Issue: https://github.com/sirloinbh/workout-memo/issues/530 (epic #524)
- Branch: feat/530-inline-workout-editor

## What changed

- `WorkoutEditor` is a page section (`<section aria-labelledby>`, role region named "New workout record" / "Edit workout journal") rendered at the top of the page body in `app.tsx`. It no longer uses `Modal` / `ModalFooter`, so no element with role dialog is added for it.
- The page below stays mounted inside a `hidden` wrapper while the editor is open, so tab, loaded data and scroll state are intact on close. The editor works the same from any page that has a "Log workout" button.
- Kept: draft recovery, save state, retry banner, Escape and the Close button (Escape is ignored while a save runs and when a field such as an open name list handles it), the Save button pinned to the bottom edge (`sticky`), and the form field styles (the section carries the `modal` class only for the CSS in `style.css`).
- Focus: moves to the editor heading on open. On close it returns to the opening control; if that control is disabled (a new record leaves a local draft, which disables "Log workout") it goes to the page content (`main`).
- The goal and machine editors stay modals. The old on-screen keyboard inset code is unused by the editor (the page scrolls normally).

## Tests

- Frontend editor tests now look up the region instead of a dialog. New `inline-editor.test.tsx` checks no dialog, heading focus, the Close button and Escape.
- e2e: `modals` fixtures carry a `role`; the 390px full-screen modal test now checks that the editor fits the width and the Save button stays on the bottom edge while the page scrolls.
- Visual baselines (`workout-editor-*`) are updated from the CI artifact; see the PR.

## Verification

- `npm run check` without `TEST_DATABASE_URL`; e2e and visual run in CI.
