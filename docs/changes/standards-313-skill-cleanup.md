# Replace workout-communication with the central shared skill (sirloinbh/project-standards#313)

## Purpose

The Korean reporting rule (`workout-communication`) became the central shared skill `std-communication`. The app skill is deleted so the same content is not kept in two places.

## Change

| File                                                                     | Content                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `skills/workout-communication/`, `.claude/skills/workout-communication/` | Deleted                                                               |
| `AGENTS.project.md`                                                      | The language for explanations to the user follows `std-communication` |

## Order

Merge this PR after the central sync PR adds `skills/std-communication/`. If it merges first, the link in `AGENTS.project.md` points to a missing file in the meantime.

## Verification

- `node scripts/claude-skills.mjs`: `.claude/skills matches skills/.`
- The only place that still points to `workout-communication` is `docs/changes/133-korean-explanations.md` (a past record)
