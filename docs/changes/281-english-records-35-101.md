# #281 Translate past change records 35 to 101 to English

- Issue: [#281](https://github.com/sirloinbh/workout-memo/issues/281) (batch: `docs/changes/` files whose names start with an issue number from 35 to 101)
- Branch: `docs/281-english-records-35-101`
- Tracked by sirloinbh/project-standards#487

## Problem

The change records in `docs/changes/` for issues 35 to 101 were written in Korean. The user asked on 2026-11-12 that every markdown file in every project be English.

## Change

I translated these 36 files to English, keeping the structure, headings, code blocks, commands, command output, file paths, identifiers, issue and PR numbers, and dates:

- `35-body-measurements.md`, `38-recovery-daily.md`, `43-agent-task.md`, `44-claude-skills.md`
- `55-no-powershell-pipe.md`, `56-ai-agent-setup-guide.md`, `58-structure-contracts.md`
- `60-vitest-playwright.md`, `62-router-query.md`, `64-shared-contract-forms.md`, `66-design-tokens-ui.md`, `68-openapi.md`
- `70-repeatable-procedures.md`, `71-mobile-overflow.md`, `73-lightsail-deploy.md`, `75-auto-deploy.md`
- `80-remove-agent-chat.md`, `82-new-workout-defaults.md`, `83-workout-feedback.md`, `84-rest-by-exercise.md`, `85-custom-date-range.md`
- `86-weight-step.md`, `87-official-weights-followup.md`, `88-routine-cycle.md`, `89-inbody-import.md`
- `98-ui-standard-decision.md`, `99-app-ui-components.md`
- `101-feedback-chips.md`, `101-journal-card.md`, `101-period-controls.md`, `101-rest-timer.md`, `101-routine-card.md`, `101-set-rows.md`, `101-stat-cards.md`, `101-volume-chart.md`, `101-workout-list.md`

No heading was renamed to an anchor that other files link to. One anchor link inside a record (`#11-부트스트랩-체크리스트` in `56-ai-agent-setup-guide.md`) points at a heading of another file and is kept as written.

## Korean kept

The remaining Hangul is only text that code, the app, or other records match on, or quoted text, each with an English gloss in parentheses:

- Quoted UI strings and button labels (for example "전체 기록", "운동 기록하기", "다시 연결"), menu names, and `aria-label` values.
- Quoted API error messages and status texts (for example the 409 message of body records, "적용할 마이그레이션이 없습니다.").
- Data values that code matches on: body-part names (가슴, 등, 어깨, 이두, 삼두, 하체-앞, 하체-뒤, 복근, 팔), the brand value `기타`, the garbled sample `湲고?`, and the title format `10월 20일(화)`.
- Korean labels quoted from other documents (`[추천·미도입]`, a section title of `database/README.md`, a sentence quoted from AGENTS.md).

## Checks

- Prettier check on the 36 changed files (shared options of `@sirloinbh/prettier-config`: single quotes, trailing commas, print width 100): formatted with `--write`, then clean.
- Hangul search (`[가-힣]`) over the batch: 26 of the 36 files still have lines with the kept Korean listed above. The other 10 files have none.
- Only the 36 files of the batch and this record file were changed.
