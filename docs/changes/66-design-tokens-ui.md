# #66 Design tokens, Tailwind, and shared UI components

- Issue: [#66](https://github.com/sirloinbh/workout-memo/issues/66) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 3: screen foundation)
- Branch: `style/66-design-tokens-ui`. Stacked on #64 (PR #65). The merge order is #59 → #61 → #63 → #65 → this PR.

## Purpose

In `style.css` (about 1,380 lines), color, corner, and shadow values were repeated as literals. Buttons, modals, and error displays were scattered across pages as class combinations.

## Change — 2026-10-20

### Packages

I installed them after the user's explicit approval that they are aware of the supply chain risk.

- Installed
  - dependencies: clsx 2.1.1, tailwind-merge 3.7.0, class-variance-authority 0.7.1
  - devDependencies: tailwindcss 4.3.3, @tailwindcss/vite 4.3.3
  - Pinned to exact versions, with `--ignore-scripts`.
- No new package has an install script.
- The native compilers come in as the official platform-specific optional packages of Tailwind (@tailwindcss/oxide-_) and Parcel (lightningcss-_).
- I regenerated the `frontend/package-lock.json` for the subtree with `--before=2026-10-06`.

### Design tokens and Tailwind

- `frontend/src/theme.css`
  - I defined the tokens with `@theme static`: 24 colors by role, 4 corner levels, and 2 shadows.
  - It imports only the Tailwind theme and utilities layers. I did not add Preflight (the global reset), because it would change the existing screens.
- I replaced the same-value literals in `style.css` with token variables (using a one-off script).
  - Replaced: 34 colors, 17 `border-radius` values, and 2 shadows.
  - Decorative colors used only once (such as the chart step colors) were kept.
- I added the `@tailwindcss/vite` plugin to `vite.config.ts`.
- Constraint: `style.css` is outside the layers, so when the same property overlaps, the existing rule beats the utility. I recorded this in `docs/design-system.md`.

### Shared components

I followed the shadcn/ui approach and wrote the source directly, without the CLI.

- `lib/cn.ts`: clsx + tailwind-merge
- `components/ui/button.tsx`: a cva-based `Button`. The variants are `primary`, `subtle`, `text`, `icon`, and `full`, and it outputs the existing class names as they are.
- `components/ui/field.tsx`: `Input`, `FieldError`, and `invalidProps`. They make the `aria-invalid` and `aria-describedby` linking of #64 common.
- `components/ui/dialog.tsx`: I moved the existing `Modal`. The behavior and DOM are the same.
- Scope applied in `app.tsx`
  - I changed all modals to `Dialog`.
  - I changed the journal, machine, and goal save buttons to `Button full`.
  - I changed the error display helper of #64 and the goal form inputs to `FieldError`, `invalidProps`, and `Input`.
- `docs/design-system.md`: the token table, the components, and the usage rules

## Tests

The new test `frontend/src/components/ui/ui.test.tsx` (4 tests):

- The `Button` variants output the existing classes as they are.
- `cn` resolves conflicting utilities.
- `FieldError` and `invalidProps` link the input and the error, and when there is no message, both the link and the element are absent.
- `Dialog`: the label, the focus of the close button, locking and restoring scroll, not closing on a click inside, and closing with Escape and a backdrop click.

Screen sameness verification (real Chrome, an uncommitted temporary spec and a canvas pixel comparison):

- Targets: 8 pages (`/`, `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`), the journal input modal, and the goal error modal. Each at desktop 1280px and mobile 390px, 20 images in total.
- Conditions: the browser clock was fixed and animations were turned off.
- Baseline reliability: before the change, I took the images twice and first confirmed that all 20 had 0 pixels of difference.
- Result: all 20 before and after comparisons had **0 pixels of difference**.

Run results (Node 24.21.0, dedicated test DB, local Chrome):

| Check                       | Result                         |
| --------------------------- | ------------------------------ |
| `npm run check`             | **EXIT=0**                     |
| Backend node:test (with DB) | **275 pass / 0 fail / 0 skip** |
| Frontend Vitest             | **12 files, 89 pass / 0 fail** |
| `npm run test:e2e`          | **2 passed**                   |
| `docker build ./frontend`   | Success                        |

## Limits and follow-up

- An existing defect: at mobile 390px, the full page width comes out as 424px (horizontal overflow). It existed before the change, and this time the goal was to keep things the same, so I did not fix it. I leave it as a follow-up issue.
- The remaining buttons and inputs in the page bodies are still the old markup. They move to `components/ui` when the screen is edited.
- The build warning `"use client" ... was ignored` comes from the react-router and react-query bundles of #62 and does not affect behavior.
