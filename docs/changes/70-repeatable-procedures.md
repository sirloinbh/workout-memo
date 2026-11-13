# #70 Reflect the repeatable procedures verified during standardization in the instructions and skills

- Issue: [#70](https://github.com/sirloinbh/workout-memo/issues/70) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 6)
- Branch: `docs/70-repeatable-procedures`. Stacked on #68 (PR #69).

## Purpose

The procedures actually run and confirmed in steps 2 to 4 (#58, #60, #62, #64, #66, and #68) were scattered only in each PR's record. I move them into the instructions and skills so the next worker and the local worker can repeat them the same way.

## Change — 2026-10-20

- `skills/workout-foundation/references/procedures.md` (new): verified repeatable procedures
  1. Adopting an npm package: check with `npm view` → user confirmation → install with a pinned version and `--ignore-scripts` → check install scripts and IOC → regenerate the subtree lockfile with `--before` → per-area Docker builds
  2. Independent builds per area: share by copying and checking, and exclude tests from the build tsconfig
  3. Screen refactoring: RTL behavior tests first, a before and after pixel comparison in real Chrome, and existing defects found go to separate issues
  4. Consecutive PRs: state the merge order, and pass a fix on a lower branch to the upper branch by merge instead of force push
  5. A table of generated artifacts and check commands
- `skills/workout-foundation/SKILL.md`: a link to the document above
- `skills/workout-foundation/references/stack.md`: I marked the progress in the recommended adoption order 1 to 6 (based on PR creation). Step 5 waits for a user decision.
- `skills/workout-testing/SKILL.md`: the criteria for updating Playwright scenarios, the criteria for screen sameness pixel comparison, and the rule to fit test data to the real contract instead of mocking
- AGENTS.md: a link to the npm package adoption procedure
- `docs/daily/2026-10-20.md` (new), the list in `docs/daily/README.md`, and `docs/next-steps/README.md` (updated priorities and follow-up features)
- I updated `.claude/skills/` with `npm run skills:sync`

## Checks

- I reviewed the document links and procedures. All the procedures are what was actually run on this working day, and the evidence is in each `docs/changes/<number>-*.md`.
- `npm run check`: the result is in the table below. Only documents and skills changed, but I ran the whole thing, including the skill mirror check (`test:skills`).
- I could not run the skill-creator `quick_validate.py`. Python has no PyYAML (the same reason as #58), and I did not install the package. I did not change the SKILL.md frontmatter.

| Check                       | Result                     |
| --------------------------- | -------------------------- |
| `npm run check`             | **EXIT=0**                 |
| Backend node:test (with DB) | 279 pass / 0 fail / 0 skip |
| Frontend Vitest             | 89 pass / 0 fail           |
| Skill mirror                | 4 pass                     |
