# Remove the DateField font-size override (#520)

#518 added `.legacy [data-slot='date-field'] input { font-size: 16px !important }` to `frontend/src/style.css` because the shared `DateField` input dropped to 14px from 768px up on touch screens. The kit now keeps it at 16px on touch at every width (sirloinbh/project-standards#1151, PR #1152), synced in #519, so the override is removed.

## Change

| File                     | Content                                   |
| ------------------------ | ----------------------------------------- |
| `frontend/src/style.css` | The override rule and its comment removed |

## Verification

- The kit's own test `the text input is 16px on a touch screen at every width` (`frontend/src/components/ui/date-field.test.tsx`) and the `ui-touch` e2e check (16px fields at 768px on touch, CI) cover it.
- `npm run check`: see the PR.
