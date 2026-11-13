# 282 Translate the remaining current docs to English (rest)

## Problem

Part of #282. PR #287 translated most of the current docs, but several Korean markdown files outside `docs/changes/` and `docs/daily/` were left. Explanations, docs and issues in this project are written in English (sirloinbh/project-standards#453).

## Change

Translated these files to English, keeping the structure, code blocks, commands, file paths, identifiers, issue and PR numbers and dates:

- `AGENTS.project.md`
- `docs/ai-agent-project-setup.md`
- `docs/fitness-app-research-2026.md`
- `docs/machine-official-weights.md`
- `docs/machine-official-weights-followup.md`
- `docs/mobile-app.md`
- `docs/next-steps/blocked-issues-recovery.md`
- `docs/ux-audit/2026-10-21.md`

Headings that were renamed, with their anchors updated inside the batch: `11. 부트스트랩 체크리스트` is now `11. Bootstrap checklist` (link in `docs/ai-agent-project-setup.md`), and `다시 측정` is now `Re-measuring` (link in `docs/ux-audit/2026-10-21.md`).

Korean kept on purpose, each with an English gloss:

- The service name `FORM · 나의 운동 기록` (FORM · My Workout Log), the Korean brand line `온힘` (Onhim) of Newtech in the machine weight tables, and Korean UI strings quoted in `docs/ux-audit/2026-10-21.md` (screen names, button labels, quoted messages).
- The Korean service names `플랜핏` (Planfit) and `번핏` (Burnfit) in `docs/fitness-app-research-2026.md`.
- The `'기타'` ("Other") brand example in `docs/ai-agent-project-setup.md`, and the quoted Korean error page text `잘못된 접근` ("invalid access") in `docs/machine-official-weights-followup.md`.

Not translated (not in scope): centrally managed files that carry the "Managed file. Edit it in sirloinbh/project-standards" header (`AGENTS.md`, `skills/std-git-writing/SKILL.md`, `.claude/skills/std-git-writing/SKILL.md`), which keep one quoted Korean line each and must be changed in `sirloinbh/project-standards`.

Notes: `docs/ai-agent-project-setup.md` still says that server validation messages are Korean in two places (section 6.1 and the pitfalls table). That is the original wording and was translated as is, even though section 2 says user-visible messages are English; it needs a separate content fix.

## Checks

- Prettier check on the changed files: see the PR body.
- Hangul search (`[\uAC00-\uD7A3]`) over the batch: only the kept items above remain.
- Documentation only; no code or tests changed.
