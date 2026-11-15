# #128 Automatic merge of agent PRs and conflict resolution for consecutive PRs

- Issue: [#128](https://github.com/sirloinbh/workout-memo/issues/128)
- Branch: `chore/128-agent-auto-merge`

## Purpose

The user changed the PR merge policy (2026-10-21). When the required CI passes, the main agent and local workers merge without asking the user. Consecutive PRs are merged in order; after the earlier PR is merged, conflicts that appear are resolved, CI is passed again, and the PR is merged. Merging to main is a production deploy (#75).

## Change — 2026-10-21

- Policy documents: the "only the user merges" sentences in `AGENTS.md`, `README.md`, `docs/ai-agent-project-setup.md`, `docs/development-baseline.md`, `docs/next-steps/README.md`, `docs/next-steps/blocked-issues-recovery.md`, and `docs/local-agent-workflow.md` were changed to "merge after CI passes". Past work records (`docs/changes`, `docs/daily`) were left as they were.
- Skills: step 5 of `workout-implementation` was changed to "merge after CI passes" and "merge consecutive PRs", and its description was updated too. The merge sentences of `workout-testing` and `workout-foundation` (SKILL, stack, procedures) were aligned. `.claude/skills/` was updated with `npm run skills:sync`.
- Still forbidden: merging with a failed or in-progress check status, bypassing protection rules with `--admin` and the like, approving one's own PR, pushing directly to main, and force push.
- Worker `ci` step (`scripts/agents/cli.mjs`)
  - After CI passes it queries `mergeable` and `mergeStateStatus`. If `MERGEABLE`, it merges with `pr merge --merge --match-head-commit <job.commit>` and completes the job. If it is not decided yet (`UNKNOWN`), it waits.
  - If `BEHIND` or `CONFLICTING`, it merges `origin/main` in the worktree and pushes, then waits for re-verification and CI on the new commit.
  - If the automatic merge conflicts, it runs `merge --abort` and marks the job blocked as `merge-conflict`. When the main agent resolves it with a merge commit in the worktree and runs `retry`, `delivery` checks that this commit is a descendant of the previous commit and then adopts it as the one to publish.
  - The PR body sentence was changed to "CI 통과 후 워커가 병합합니다" (the worker merges after CI passes).
- Tests: added 5 merge-boundary tests to `scripts/test/agent-publication-resume.test.mjs`.
  - merge with the verified head
  - wait when mergeability is not decided
  - when behind main, merge and push, then wait
  - abort and blocked on conflict
  - adopt the conflict resolution commit

## Verification

Local (Windows, Node 24.21.0). Run step by step.

- `node --test scripts/test/agent-publication-resume.test.mjs`: 11 pass, 0 fail (including 5 new)
- `prettier --check` (files changed in this PR), `lint`, `contract:check`, `typecheck`, `test:skills` (4 pass), `test:docs` (3 pass), `build`: passed
- `npm test`: of 241 backend tests, 206 pass, 35 skip (DB integration tests skipped because `TEST_DATABASE_URL` is not set), 0 fail. Of 121 screen tests, 120 pass, 1 fail.
  - The 1 failure is a 5-second timeout in `routines.test.tsx`. When only that file is run alone, 8/8 passed.
  - This PR did not change `frontend/`. I take it as a timing problem from the high machine load during parallel work.
- `test:agents`: of 167, 165 pass, 2 fail. The failures are the 2 PowerShell boundary tests of #24 in `agent-runtime.test.mjs`.
  - The local execution policy (`UnauthorizedAccess`) blocked running `.ps1`.
  - The same 2 failed identically in an `origin/main` worktree, so I confirmed that they have nothing to do with this change.
- The full `npm run check` stopped at `format:check` because of a format warning in a local uncommitted user change (`scripts/test/project-github-auth.test.mjs`), so I ran it step by step. That file is not included in this PR.
- DB integration tests and the full check are confirmed with the CI `verify` result.

## Limits and follow-up

- The real GitHub merge behavior will first be seen in the next worker job after this PR is merged. The tests verified only the boundaries with fake GitHub responses.
- The same policy was applied to the other personal projects through a PR in each repository.

## Change — 2026-10-21: automatic code review after the PR (at most 2 times)

The user added to the merge policy. After a PR is opened, it goes through automatic code review at most 2 times. If the review finds something to fix, it is applied with an additional commit, and after the first fix one more second review is done. After the second fix commit there is no further review; when the required CI of the final head passes, the PR is merged. If there is nothing to fix, it is merged right after checking CI. If a fix is big, it is split into a new issue card.

- `AGENTS.md` procedure: added step 5 (automatic review at most 2 times) and moved the merge to step 6.
- `workout-implementation`: added "5. Automatic code review after the PR (at most 2 times)". Its content is as follows.
  - scope of the first and second reviews
  - no re-review after the second fix
  - criteria for splitting a big fix: a feature out of scope, design or data structure change, changes in several modules, separate verification needed
  - conditions to hold the merge: a defect that would break main if split, risk to security or data
  - where to record each round: PR comments and `docs/changes`
- The merge step of `workout-implementation` is now step 6. I added the sentence that if a new commit appears during review, the PR is merged only with the CI of the final head. The description was updated too.
- Documents aligned with the same wording: `README.md`, `docs/ai-agent-project-setup.md`, `docs/development-baseline.md`, `workout-testing`, `workout-foundation` (SKILL, stack). Then I ran `npm run skills:sync`.
- Local worker: I wrote in `docs/local-agent-workflow.md` that the existing independent review before publishing (at most 2 times, blocked when rejected the second time) replaces this review.
  - A blocked job is handled by the main agent. After applying the second fix commit, it merges after CI, or splits a big fix into an issue.
  - The worker code was not changed.
- The same policy was also applied with an additional commit to the policy PRs of the 8 other personal projects.

### Verification

The results run locally (Windows, Node 24.21.0) are as follows.

| Check                                                         | Result          |
| ------------------------------------------------------------- | --------------- |
| `npm run test:skills`                                         | 4 pass          |
| `npm run test:docs`                                           | 3 pass          |
| `node --test scripts/test/agent-publication-resume.test.mjs`  | 11 pass, 0 fail |
| `npm run lint`                                                | passed          |
| `prettier --check` (changed docs, `skills`, `.claude/skills`) | passed          |
| `git diff --check`                                            | passed          |
| skill-creator `quick_validate.py` (`PYTHONUTF8=1`, 3 skills)  | all valid       |

This commit changed only documents and skills. The app code and worker code did not change, so the full app check is confirmed with the CI `verify`.
