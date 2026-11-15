# #281 docs: Translate past records 1 to 26 to English

- Issue: https://github.com/sirloinbh/workout-memo/issues/281 (part of sirloinbh/project-standards#487)
- Branch: docs/281-english-records-1-26

## Problem

The past change records for issues 1 to 26 in `docs/changes/` were written in Korean. The repository now writes all documents in English.

## Change

Translated these files to English, keeping structure, code blocks, commands, command output, file paths, identifiers, issue and PR numbers, dates, and hashes:

- `docs/changes/1-project-skills.md`
- `docs/changes/4-development-baseline.md`
- `docs/changes/6-project-github-auth.md`
- `docs/changes/8-local-agent-workflow.md`
- `docs/changes/9-agent-task.md`
- `docs/changes/12-personal-github-config.md`
- `docs/changes/14-personal-tools.md`
- `docs/changes/16-agent-task.md`
- `docs/changes/17-agent-task.md`
- `docs/changes/18-agent-task.md`
- `docs/changes/19-agent-task.md`
- `docs/changes/21-agent-task.md`
- `docs/changes/24-agent-task.md`
- `docs/changes/26-agent-task.md`

Korean kept on purpose, each with an English gloss:

- Quoted UI strings, messages, and test inputs.
- Quoted commit titles in the `Work commit:` lines, which carry an English gloss.
- The Korean section headings of the issue template that a quoted check script matches on (for example `완료 기준`).

## Checks

- Prettier check on the changed files (`--check`, then `--write` where needed).
- Hangul search (`[\uAC00-\uD7A3]`) over `docs/changes/{1..26}-*.md`; what remains is the intentional Korean listed above.
