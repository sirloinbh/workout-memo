# #281 Translate past change records 102 to 115 to English

- Issue: [#281](https://github.com/sirloinbh/workout-memo/issues/281) (part of sirloinbh/project-standards#487)
- Branch: `docs/281-english-records-102-115`

## Problem

The user asked that every markdown file in every project be English. The change records in `docs/changes/` whose names start with an issue number from 102 to 115 were written in Korean.

## Change

Translated these 22 files to English, keeping the structure, code blocks, commands, file paths, identifiers, issue and PR numbers, and dates:

- `102-analysis-period.md`, `102-analysis.md`, `102-goals.md`, `102-routine-form.md`, `102-routine-plan.md`
- `103-backup-page.md`, `103-body-records.md`, `103-inbody-preview.md`, `103-machine-form.md`, `103-machine-list.md`, `103-style-cleanup.md`
- `104-mobile-touch-targets.md`
- `105-mobile-modal.md`, `105-rest-timer.md`, `105-set-cards.md`
- `108-mobile-app.md`
- `112-ux-audit.md`
- `113-ui-regression-checks.md`
- `114-cardio-model.md`
- `115-cardio-form.md`, `115-cardio-stats.md`, `115-cardio-tab.md`

Korean kept on purpose, each with an English gloss in parentheses: quoted UI strings (button names, labels, headings, notices), accessible names that tests look up, quoted API error messages, and Korean data values that code matches on (for example the `4주차` ("week 4") style week labels and body-part names such as `팔`).

## Checks

- Prettier `--check` passes on all 23 files (shared options from `packages/prettier-config` in project-standards, run with the money-ledger Prettier 3.9.10 because this clone has no `node_modules`; the Tailwind plugin does not affect markdown).
- Hangul search (`[가-힣]`) over the batch: the remaining Korean is only the quoted strings listed above.
