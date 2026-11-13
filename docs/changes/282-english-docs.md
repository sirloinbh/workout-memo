# #282 Translate the current Korean docs to English (part 1)

## Problem

About 47 markdown files outside `docs/changes/`, `docs/daily/`, and `docs/adr/` were Korean (issue #282, tracked in sirloinbh/project-standards#487).

## Change

- Translated to English: `README.md`, `backend/README.md`, `frontend/README.md`, `database/README.md`, `docs/api.md`, `docs/activity-import.md`, `docs/agent-issue-template.md`, `docs/deployment.md`, `docs/design-system.md`, `docs/development-baseline.md`, `docs/local-agent-workflow.md`, `docs/project-github-auth.md`, `docs/next-steps/README.md`, and the five `workout-*` skill files (`skills/` and the `.claude/skills/` copies, kept identical).
- `docs/openapi.json`: the `summary` strings are generated from the endpoint table of `docs/api.md`, so they were replaced with the new English descriptions (45 rows, same text as the table without backticks).
- Heading anchors that other files link to were renamed together: `database/README.md#applying-migrations-58` and `#app-export-and-backup-33`.
- Kept in Korean on purpose: API error messages and request values that the code matches on (for example `confirm: "전체 교체"`, `미분류`, body part names, brand and lineup names), each with an English gloss.

## Not done in this PR

These files still contain Korean and need a follow-up (see the PR description): `docs/ai-agent-project-setup.md`, `docs/fitness-app-research-2026.md`, `docs/machine-official-weights.md`, `docs/machine-official-weights-followup.md`, `docs/mobile-app.md`, `docs/next-steps/blocked-issues-recovery.md`, `docs/ux-audit/2026-10-21.md`.

## Verification

- Prettier check with the shared `@sirloinbh/prettier-config` options on every changed markdown file: pass.
- `node --test scripts/test/claude-skills.test.mjs scripts/test/docs-commands.test.mjs`: pass (skills copies match, no PowerShell pipe patterns).
- Backend tests (`api-contract`, `openapi`) could not run locally because this clone has no installed `node_modules`; CI runs them. The table format of `docs/api.md` was kept as is.
