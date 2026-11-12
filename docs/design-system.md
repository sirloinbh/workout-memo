# Design system

workout-memo uses the design system shared by the 8 apps (#159, central project-standards #126). The source of the shared rules is the central repo's `docs/design-system.md`, `docs/ui-components.md`, `docs/layout.md`, and `docs/pwa.md`. This document describes only what exists only in workout-memo.

## UI standard decision (#98)

The user decided on 2026-10-30. Dark-only was applied in #184. Because the user chose to use only the dark screen, the baseline for all screens and screen checks is dark alone.

| Item                          | Decision                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Component baseline            | shadcn/ui + Radix (`radix-ui` 1.7.0). The 17 shared components are in `frontend/src/components/ui`                        |
| Candidates dropped            | Base UI, Ark UI, and writing our own. They were not picked because we decided to follow the baseline shared by the 8 apps |
| Design tone                   | Dark mode only. Colors use the shared dark tokens as they are (background `#0a0a0a`, card `#171717`)                      |
| Light and system              | The choices were removed. It is fixed with the central registry `features.darkOnly` (central ADR-0011)                    |
| New npm packages              | The user allowed adopting them, but the packages we need are already installed, so there is nothing new to bring in       |
| Preflight (#100)              | Turned on in #159 together with Tailwind CSS 4                                                                            |
| Representative screen mockups | We do not make them separately. We check against the visual baselines of #184                                             |

The sources are the central `docs/ui-components.md` for the component list, the central `docs/design-system.md` for text and contrast standards, and the central `docs/layout.md` for layout. How to build something the shared components do not have also follows the "Components" section of the central `docs/design-system.md`.

The issues that apply this baseline are as follows. The decision comments are project-standards#354, #184, and #101 to #104, and #99 and #105 are listed together because the dependencies of each issue name #98 or #104.

| Issue                 | Content                                                   |
| --------------------- | --------------------------------------------------------- |
| project-standards#354 | Per-app option to fix dark mode. A prerequisite of #184   |
| #184                  | Applying dark-only and the dark baseline of screen checks |
| #99                   | Extending the shared components                           |
| #101, #102, #103      | Replacing with shared components, screen by screen        |
| #104, #105            | Mobile layout and the input flow                          |

## Structure

| File                                        | Managed by | Role                                                                                                                             |
| ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/index.css`                    | App        | Tailwind CSS 4, `tw-animate-css`, `@sirloinbh/design-tokens` (black-and-white light and dark, Pretendard)                        |
| `frontend/src/style.css`                    | App        | Page styles that existed before the switch. It goes into the `components` layer, and colors refer only to the shared tokens      |
| `frontend/src/components/ui/`               | Central    | shadcn/ui shared components (Button, Dialog, Sheet, and so on). Do not edit them directly                                        |
| `frontend/src/components/layout/`           | Central    | `AppShell` (top bar, main menu, body, footer). The screen mode menu is not drawn because it is dark-only                         |
| `frontend/src/lib/utils.ts`, `lib/theme.ts` | Central    | `cn()` and applying the screen mode. It is always dark through `DARK_ONLY` in `lib/theme-config.ts`                              |
| `frontend/public/theme-init.js`             | Central    | Applies dark before the first paint (prevents flicker). The stored value is ignored                                              |
| `frontend/src/components/modal.tsx`         | App        | `Modal`: an app wrapper that opens the shared Dialog with `title` and `close`. The content uses the `.legacy .modal` form styles |
| `frontend/src/components/field.tsx`         | App        | `Input`, `FieldError`, `invalidProps(name, message)`: connect the error text to the input                                        |
| `frontend/src/components/form-styles.ts`    | App        | Shared form classes (#103): `fieldLabel`, `touchText`, `selectField`, `textareaField`, `formHint`                                |

## App-specific components (#99)

They are not in the shared components, so they were built in `frontend/src/components/`. If several apps come to need them, move them to the central repo. They are used in the screen replacements (#101 to #105).

| Component          | When to use                                                                                                                                            | Rules, keyboard, and accessibility                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SegmentedControl` | Always one out of a few: the period tabs                                                                                                               | `label` is the group name. One is always selected, and pressing the current item again only calls `onReselect`. Do not use it for the perceived-effort feedback, where deselecting is allowed. Tab goes into the selected item. The arrows only move focus, and Space or Enter picks |
| `ToggleChips`      | Several selections (zero is fine): assigning body parts. A single selection that can be cleared (feeling feedback) keeps only one on the caller's side | Each chip reports its state with `aria-pressed`. Arrows move, and Space or Enter turns it on and off                                                                                                                                                                                 |
| `Switch`           | A setting that applies right away: auto-start of the rest timer                                                                                        | Name it with `htmlFor` of `Label`. For a value saved together with a form, use the shared `Checkbox`. The press area is wide on touch devices                                                                                                                                        |
| `NumberInput`      | kg and reps entered with one hand                                                                                                                      | `label` is the name of the input and the − + buttons. The value is a string, and the form and the server do the validation. A decimal `step` opens the decimal keypad. For a value that has an integer `step` but accepts decimals, pass `inputMode="decimal"`                       |
| `List`, `ListItem` | A list of records inside a `Card`                                                                                                                      | Put an `aria-label` on `List`. There is a divider between rows and the row height is 44px or more                                                                                                                                                                                    |

`StatCard` (#101) is a summary number card built on `Card`. It takes a label, a value and unit, and a short description.

`PageHeader` (#222) is the heading at the very top of a page. It takes an eyebrow, an `h1` (with a faded dot at the end), a description, and a place for the main buttons (`actions`). Put the shared `Button` in it; on a phone it goes under the text, and from `md` up it goes on the right.

```tsx
<SegmentedControl label="기간" options={periods} value={period} onValueChange={setPeriod} />
<NumberInput label="중량" value={weight} onValueChange={setWeight} step={2.5} min={0} />
```

(In the example, the labels are "Period" and "Weight"; the code is kept as it is.)

## Rules

1. For a new screen element, use the shared components in `components/ui` first. For a modal, `Modal`; for a form error, `invalidProps` and `FieldError`.
2. For colors, use only the shared token names (`bg-primary`, `text-muted-foreground`, and `var(--primary)` in CSS). Do not write color codes directly, and do not override the tokens in the app.
3. The element rules of `style.css` (`button`, `p`, `h1`, and so on) apply only inside `.legacy`. The page body and the content of `Modal` are `.legacy`, and the shared shell and the shared components are not affected.
4. `style.css` is in the `components` layer, so for the same property a Tailwind utility wins. When you move an existing screen to utilities and shared components, delete the matching `style.css` rule.
5. The contrast rules at the end of `style.css` were made for light mode. They pass the axe check in dark too, so they are left as they are, and they are deleted when a screen moves to the shared components. Do not add to these rules for a new background.
6. Put the error text outside the `<label>` so it does not change the accessible name of the input.
