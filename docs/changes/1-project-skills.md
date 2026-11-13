# #1 Implementation procedure and development foundation skills

- Issue: https://github.com/sirloinbh/workout-memo/issues/1
- Branch: `docs/1-project-skills`
- Purpose: apply the user-specified procedure for issues, branches, docs, tests, and PRs to later work as well.

## Work commit: docs: 구현 절차와 개발 기반 스킬 추가 (#1) (add implementation procedure and development foundation skills)

- `AGENTS.md` now states the work order, the accounts and remote repositories, the check commands, and the subtree sync scope.
- The `workout-implementation` skill defines reusing an issue, branches based on the real number, a docs record per commit, a PR after verification, and a user-only merge procedure.
- The `workout-foundation` skill and its reference docs organize the existing technology recommendations, the 9 preparation areas, and the order of application. Recommendations are kept separate from automatic install instructions.
- The README points to the project instructions and the skill sources.
- The repository `skills/` is the maintained source, and verified copies are installed in the current Codex account's `skills/`.
- Verification results are recorded below after the run. This change is limited to docs and skills, so it does not require app build, DB, or browser tests.

## Verification

- skill-creator `quick_validate.py`: passed 4 times in total, for the two repository source skills and the two Codex installed skills.
- Confirmed that the SHA-256 of `SKILL.md` matches between source and installed copy.
- `git diff --check`: passed. Confirmed that the targets of the main local doc links exist.
- PyYAML, which the validator needs, was installed only in `.local/skill-validator`, which is excluded from Git. App dependencies were not changed.
- App build, DB, and browser tests were not run, because only docs and skills changed and no app code or run settings changed. The app checks in GitHub CI are confirmed separately on the PR.

## Scope and follow-up

- App code, dependencies, and the deployment environment are not changed.
- Installing new tools and building the development foundation are done later in separate issues.
- The PR is handed over open, and the user merges it directly.

## Work commit: docs: 테스트 작성과 커밋·PR 검증 규칙 추가 (#1) (add rules for writing tests and for commit and PR verification)

- Added the workout-testing skill and linked it from the implementation procedure, the development foundation skill, and AGENTS.md.
- Set that feature work and behavior fixes include related tests, bug fixes include a regression test, and implementation, tests, and docs go in the same commit.
- Requires running the related tests before committing and before creating or updating a PR, and recording the real pass/fail/skip and the reason for anything not run. If the code has not changed and the same verification result is still valid, the same check is not repeated needlessly.
- Test failures must not be worked around by skipping, deleting, or weakening assertions. If required verification cannot be done, it is not reported as complete and the PR stays a draft.
- This change is a skill and docs change that does not alter app behavior, so no meaningless app tests were added. The official skill validator was run on the 3 sources and 3 installed copies and passed 6 times.
- Confirmed the SHA-256 match between source and installed copies and that git diff --check passed. PR CI is checked separately against the new commit.
- Reused the existing skill work: open issue #1, branch docs/1-project-skills, and PR #2. PR #5 and main were not changed.
