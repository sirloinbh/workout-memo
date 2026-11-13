# 281 Translate the daily logs and unnumbered change records to English

## Problem

The files in `docs/daily/` and the change records in `docs/changes/` whose names do not start with a number were written in Korean. The user asked on 2026-11-12 that every markdown file in every project be English. This is one batch of #281 (tracked by sirloinbh/project-standards#487). Other batches translate the numbered change records.

## Change

Translated to English, keeping the structure, tables, links, commands, file paths, identifiers, dates, and issue and PR numbers:

- `docs/daily/README.md`
- `docs/daily/2026-10-15.md`, `2026-10-19.md`, `2026-10-20.md`, `2026-10-31.md`
- `docs/daily/2026-11-01.md`, `2026-11-02.md`, `2026-11-03.md`, `2026-11-05.md`, `2026-11-06.md`, `2026-11-08.md`
- `docs/changes/standards-313-skill-cleanup.md`
- `docs/changes/standards-357-visual-baselines.md`

Korean kept on purpose (UI strings with an English gloss):

- `2026-11-01.md`: the button label "휴식 시작" (start rest)
- `2026-11-03.md`: the option label "자유 운동" (free workout)
- `2026-11-08.md`: the link label "운동 목록" (workout list)

No headings that other files link to by anchor were renamed. Links to the daily files use file names only.

## Checks

- Prettier check on the changed files with the repo's `prettier.config.mjs` (using the Prettier of `D:/github/money-ledger/node_modules`): passed after `--write`.
- Hangul search (`[\uAC00-\uD7A3]`) over the batch: only the three quoted UI strings above remain.
