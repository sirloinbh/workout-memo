# Use the synced UI kit components (#393)

Screens now import `Switch`, `SegmentedControl`, `DateStepper`/`RangeSummary`, `StatCard`, `AlertBanner`, `PageHeader` and `FieldError`/`invalidProps` from `components/ui/` (the centrally managed copies, project-standards#689). The local copies and their tests are deleted; the kit has its own tests.

## Differences handled

| Component     | Difference                                                                          | What this change does                                                                                    |
| ------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AlertBanner` | no default `mb-5`                                                                   | every use that had no `mb-*` class gets `mb-5`                                                           |
| `PageHeader`  | no closing dot, optional eyebrow, no page margin, eyebrow in the kit's caption size | the two uses pass `mb-6 md:mb-9`; the dot and eyebrow size follow the kit (visual baselines change)      |
| `FieldError`  | `data-slot="field-error"` and Tailwind classes instead of `.field-error`            | `style.css` keeps the grid-span and margin under `[data-slot="field-error"]` so form grids look the same |

## Not done

`number-input.tsx` and `number-step.ts` stay local: the kit's `NumberValueInput` takes `number` only (an emptied field becomes 0) and has no `optionalNumber`, while this app needs `number | undefined` (#383). Needs a change in project-standards first.

## Checks

`npm run check` (see the PR).
