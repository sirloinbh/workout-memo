---
name: workout-implementation
description: Follow the user's issue, numbered branch, implementation with docs, tests, PR, up to two automated review rounds, and merge-after-CI workflow for changes to the sirloinbh workout-memo project. Use for code, configuration, documentation, and skill edits; exclude read-only questions and recommendations. Review each PR at most twice with fix commits, split large fixes into new issues, merge once required CI passes, and resolve conflicts between stacked PRs.
---

# Workout Memo Implementation Procedure

This skill applies to changes in `sirloinbh/workout-memo`. Do not apply this account, repository, or policy to other projects. First read `AGENTS.md` at the project root and the related docs. Follow the order below and carry a PR that has gone through automatic review and CI all the way to merge.

## 1. Register an issue card

- Check the GitHub remote URL and `gh api user --jq .login`. The expected account is `sirloinbh`; if it is another account, do not make remote changes until the authentication is fixed.
- Reuse the issue the user named, or an issue already registered for the same request. Check the existing result before retrying so you do not create a duplicate issue.
- In a new issue, write the problem and purpose, the requested scope, the done criteria, and how to verify. In this project an issue card means a GitHub Issue. Unless a separate Projects board is specified, do not create or link a board.
- Write the body to a UTF-8 temporary file and register it with `gh issue create --repo sirloinbh/workout-memo --title ... --body-file ...`. Do not put tokens or secrets in the body.
- Keep the real issue number and URL that were issued. If the issue registration fails, do not make up a number or start code changes first.

## 2. Create a branch from the issue number

- Check the working tree and the current branch. If there are changes from other work, preserve them and avoid mixing work.
- The default target branch is `main`. Do not start new work from an unrelated unmerged work branch. In a clean working tree, fetch the remote main and branch from it. If there are user changes, prepare a workspace that can preserve them.
- Branch name: `<type>/<number>-<short-slug>`. Examples: `feat/12-workout-editor`, `fix/13-goal-date`, `docs/14-project-skills`, `chore/15-ci`.
- If a branch for the same issue already exists, check its state and continue with it.
- Make changes and commits on this branch. Do not commit or push directly to `main`.

## 3. Implementation and a docs record for each commit

- When implementing or fixing, read the project's `skills/workout-testing/SKILL.md` and write or update the related tests together. For a bug fix, add a regression test. Include the implementation, the tests, and the docs in the same work commit, and run the related tests before committing.
- Implement only the requested scope. For development foundation work, read `workout-foundation` as well.
- Create `docs/changes/<number>-<slug>.md` and record the issue link, the purpose, the changes, the verification, and the limits and follow-up work.
- **Record in the docs, in each work commit, the changes and the verification done in that commit.** You may accumulate entries in one issue doc. A commit that only edits docs also updates the record of that work.
- In the record, leave the reason for the change and the observed results. Do not write that a check or a deployment was done when it was not run. You do not need to create in advance the SHA that points at the commit itself. Tell them apart by commit title or by unit of work.
- A commit title includes the type and the issue number, such as `feat: ... (#12)`, `fix: ... (#13)`, `docs: ... (#14)`.
- Before staging, check the diff and whether it contains secrets, and stage only the related files, by name. Do not include another user's changes.

## 4. Open a PR after testing

- Before creating or updating a PR, run the related tests and the required checks on the final changes. Leave the test code you added or changed, the behavior you verified, the real commands you ran, and pass/fail/skip in the docs and the PR. The required commands and the conditions for DB integration tests follow the project `AGENTS.md`. Do not add app tests that a plain docs or skill edit does not need.
- Fix failures, and separate checks you could not run, DB tests that were skipped, and browser verification that is unfinished in the docs and the PR. If a needed verification is blocked, make the PR a draft.
- Push only the work branch. The PR target is `main` of `sirloinbh/workout-memo`. The subtree sync script pushes main and the sub-repositories, so do not use it in this step.
- If a PR for the same head branch exists, update it and do not create a duplicate.
- Pass the PR body as a UTF-8 file. Include the problem and the behavior after the change, the main changes, the real check commands and results, evidence where possible for a screen change, and `Closes #<number>`. If there are no images, give the reason and the limits of the verification.
- Check the GitHub Actions results and fix related failures. Say so for checks that are still running. If you changed code after creating the PR, re-run the affected checks and update the results in the docs and the PR.

## 5. Automatic code review after the PR (at most 2 rounds)

- **First review**: after opening the PR, run a read-only review that is separate from the authoring context (a separate agent, a review tool, and so on). Using the issue's done criteria and the whole PR diff as the baseline, look at correctness, regressions, security, missing tests, and the docs record.
- **If there is nothing to fix**, end the review and go to step 6.
- **If there is something to fix**, apply only the findings that belong in the scope of this PR. Make an additional commit that carries the related tests and docs record, and push.
- **Second review**: check that the first findings were applied and look at the additional diff, and also look at the final whole PR diff. If there is nothing to fix, go to step 6.
- **Second round of fixes**: apply the second findings in an additional commit. The review is at most 2 rounds, so do not do a third review; go to step 6.
- **Split large fixes**: do not fix findings of the following kinds in this PR. Instead, create a new issue card in the step 1 format (problem, scope, done criteria). Leave the issue link in a PR comment and the docs record, and continue with this PR.
  - Features outside the requested scope
  - Design or data structure changes
  - Changes that span several modules
  - Work that needs separate verification
- **Hold the merge**: if the following defects remain, do not merge and tell the user.
  - A defect that would break main if split off
  - A defect that risks security or data corruption
- **Record**: leave the result of each review round in a PR comment and in the `docs/changes` record. Write the findings, the commit that applied them, the issues that were split off, and whether there was nothing to fix.
- For a local worker job, the independent review before publishing (at most 2 rounds) stands in for this step. A job that is blocked by a second rejection is handled by the main agent under the second-round fix or issue-split rules of this step.

## 6. Merge after CI passes

- Re-run the related tests on the final commit, including the review fix commits. If a new commit appears during the review, do not merge on the earlier CI result.
- **When all the required CI checks on the final head pass, merge the PR without asking the user.** Run `pr merge <url> --merge --match-head-commit <verified head SHA>` with the project GitHub wrapper. The merge commit method preserves the history of stacked PRs.
- If a check fails or is still running, do not merge. Do not bypass branch protection with `--admin` or the like, approve your own PR, commit or push directly to main, or force push.
- After the merge, check that the issue was closed by `Closes #<number>`. A merge to main is deployed automatically by the server timer after CI passes (#75), so check the deployment result, and if it fails, report it with the cause.
- Hand over the issue URL, the branch name, the PR URL, the verification results, the results of each review round, the issues that were split off, the merge commit, and the remaining work.

### Merging stacked PRs

- Merge one at a time, in merge order. When an earlier PR is merged, merge `origin/main` into the next PR branch.
- If there is a conflict, resolve it so that the intent of both changes survives. If the intents do not fit and a judgment is needed, ask the user.
- After resolving, re-run the related tests, update the docs record, and do a normal push. When CI passes again, merge, and repeat to the end of the stack.
- Close, with a reason, a PR whose content is already fully in main.

## Authentication and failure handling

Do not recheck already granted permission for issues, pushes, and PRs without need. Comply with the execution permissions the tool asks for and with GitHub authentication. On a failure, resume from the step you had completed, and if the result of a remote creation is unclear, look it up before retrying. Do not work around an account or authentication problem by creating things with another account.
