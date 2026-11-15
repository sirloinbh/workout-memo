# #281 Translate past change records 116 and up to English

- Issue: [#281](https://github.com/sirloinbh/workout-memo/issues/281) (tracking: sirloinbh/project-standards#487)
- Branch: `docs/281-english-records-116-up`

## Problem

The change records in `docs/changes/` whose file names start with an issue number of 116 or more were written in Korean. The user asked on 2026-11-12 that every markdown file in every project be English. Other batches of #281 (records below 116, `docs/daily/`, `docs/adr/`) are handled in separate PRs.

## Change

I translated these 36 files to English, keeping the structure, code blocks, commands, file paths, identifiers, issue and PR numbers, and dates:

116-cardio-goals, 118-activity-import, 123-body-default-range, 124-exercise-autocomplete, 125-analysis-mobile, 127-test-harness-encoding, 128-agent-auto-merge, 131-a11y-stale-allowlist, 133-korean-explanations, 136-port-reassign-agents-split, 138-central-tools, 139-central-costs, 140-week-start-exception, 141-remove-infrastructure, 148-lhci-0.16, 149-central-agent-worker, 151-remove-old-autodeploy-units, 159-design-system, 162-remove-company-account, 172-http-errors, 173-cardio-loading, 173-loading-rest, 173-loading-skeleton, 174-gitignore-tool-outputs, 184-dark-only, 190-daily-2026-10-31, 193-zod4-syntax, 198-touch-after-click, 204-daily-2026-11-01-close, 222-page-heading, 223-app-notices, 224-period-controls, 251-cardio-goal-suggestion, 253-backup-cardio-goals, 263-chart-dots, 271-checkbox-tap-override.

Headings were renamed to English. No link in this batch pointed to a renamed heading anchor. The alt text of the three images in `159-design-system.md` was translated; the image paths are unchanged.

Korean that I kept on purpose, mostly with a short English gloss in parentheses:

- Quoted UI strings, button and menu labels, and test names (for example "다시 연결", "운동 목록", "유산소 목표").
- Quoted API error messages and the text of Korean validation messages that the code returns.
- Korean data values and sample text that code or tests match on (for example the exercise names `벤치 프레스` and `벤치프레스`).
- Quoted CI and test failure text, and file system paths that contain Korean (`...\OneDrive\문서\...`).

## Checks

- Prettier check and write on the 36 changed files plus this record: passed.
- Hangul search (`[가-힣]`) over the batch: the remaining Korean is only the kept items listed above.
