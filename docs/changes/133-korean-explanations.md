# #133 Skill for always writing explanations to the user in Korean

- Issue: [#133](https://github.com/sirloinbh/workout-memo/issues/133)
- Branch: `docs/133-korean-explanations`

## Purpose

An agent once gave a work report in English (2026-10-22, the reports on #130 and #127). The user asked to always receive explanations in Korean and wanted this rule kept as a skill.

## Change — 2026-10-22

- New skill `skills/workout-communication/SKILL.md`
  - Written in Korean: final reports, progress notes, questions, explanations of errors and blocks, and translated delivery of English material (subagent reviews, tool output summaries, research results)
  - Kept in the original: commands, paths, identifiers, original error and log text (with the Korean meaning added), and commit and PR titles with a fixed format (→ replaced by the "repository artifacts" rule below in the first fix)
  - Out of scope: the language of subagent instructions, and the language of code comments and existing documents
- I linked this skill from the first item of "Skills and docs" in `AGENTS.md`. The skill description alone does not guarantee that it applies in every conversation, so I made the always-read project instructions point to it.
- I generated `.claude/skills/workout-communication/` with `npm run skills:sync`.

## Verification

Only documents and skills changed, so the app tests (build, unit, and e2e of `npm run check`) were not run.

- skill-creator `quick_validate.py` (`PYTHONUTF8=1`, 4 skills): all `Skill is valid!`
- `npm run test:skills` 4 pass, `npm run test:docs` 3 pass
- `prettier --check AGENTS.md skills .claude/skills docs/changes/133-korean-explanations.md`: passed

## First automatic review — 2026-10-22

A separate read-only review agent reviewed the whole diff of PR #134. All completion criteria were met and there was no major problem. It also confirmed that the copy matches (`.claude/skills matches skills/.`).

1. **minor**: Commit and PR titles were in "keep as the original", which could be read as "write them in English". → Moved to a "repository artifacts" section, and stated that the format follows workout-implementation but the description part is written in Korean.
2. **minor**: The language of issue and PR bodies, review comments, and new docs was not set. → Added "Korean, as the repository convention" to the same section.
3. **nit**: The sentence "CI of the previous main (`b3e03ad`) passed" in the docs had no basis confirmed in this work. → Deleted.
4. **nit**: The AGENTS.md summary lacked the keep-original exception. → Added "commands, paths, identifiers, and original error text are left as they are".

### First fix verification

- After `npm run skills:sync`, `npm run test:skills` 4 pass, `npm run test:docs` 3 pass
- `quick_validate.py skills/workout-communication` (`PYTHONUTF8=1`): `Skill is valid!`
- `prettier --check` (changed files): passed

## Second automatic review — 2026-10-22

A separate read-only review agent reviewed the first fix (`5c86a2e`) and the final whole diff. All 4 comments of the first review were applied, and there is no conflict with the existing skills and AGENTS.md.

- **minor**: In the summary of the "Change" section above, commit and PR titles were still "keep as the original", which differed from the current SKILL.md. → Because this is a cumulative record, I did not delete the original text and marked it as replaced.
- **nit**: The summary of the change lacked the "repository artifacts" section. → Comment 1 of the first review describes this section, so I made the mark above point to that item.
- Reviews are at most 2, so there is no further review after this fix.

### Second fix verification

- `npm run test:skills` 4 pass, `npm run test:docs` 3 pass, `prettier --check` (changed files) passed
