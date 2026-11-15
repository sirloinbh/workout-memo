# #281 docs: Translate past records 27 to 34 to English

- Issue: https://github.com/sirloinbh/workout-memo/issues/281 (part of sirloinbh/project-standards#487)
- Branch: docs/281-english-records-27-34

## Problem

The past change records for issues 27 to 34 in `docs/changes/` were written in Korean. The repository now writes all documents in English.

## Change

Translated these files to English, keeping structure, code blocks, commands, command output, file paths, identifiers, issue and PR numbers, dates, and hashes:

- `docs/changes/27-agent-task.md`
- `docs/changes/28-routine-daily-goals.md`
- `docs/changes/29-machine-official-weights.md`
- `docs/changes/30-fitness-app-research.md`
- `docs/changes/31-set-completion-timer-rpe.md`
- `docs/changes/32-exercise-pr-analysis.md`
- `docs/changes/33-csv-backup-restore.md`
- `docs/changes/34-agent-task.md`

Korean kept on purpose, each with an English gloss:

- Quoted UI strings the app shows or the tests match on (for example `루틴짜기`, `완료`, `전체 교체`, `종목 분석`, `백업·내보내기`).
- Quoted server and UI messages (for example `선택한 공식 참고값이 존재하지 않습니다`).
- Body-part names (가슴, 등, 어깨, 팔, 하체-앞, 하체-뒤, 복근) and the `기타`/`미분류`/`제외됨` data and display values.
- Korean exercise names, titles, and memo samples used as test or browser inputs.
- The Korean issue comment titles that are quoted as references.
- The names `온힘` (Onhim) and `뉴텍` (Newtech).

## Checks

- Prettier check on the changed files (`--check`, then `--write` where needed).
- Hangul search (`[\uAC00-\uD7A3]`) over the batch; what remains is the intentional Korean listed above.
