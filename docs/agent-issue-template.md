# Example of a local agent requirement issue

Copy the content of the code block below and use it as the body of a GitHub issue. Replace the items in square brackets with the real requirement, and write the done criteria as results that can be checked, such as files, screens, or responses. The example is documentation work to be requested later; it does not mean a specific feature is implemented, and it does not stand for an issue number that has not been issued.

```markdown
## User requirement

Write a local run guide so that a user who wants to run the project on a PC can check, in one document, the preparation needed, the order of running it, and whether it runs correctly.

## Scope

- Write an English local run guide at [guide document path].
- Explain the prerequisites, the run commands, the address to open, and how to stop, as checked in the current repo.
- Add a relative path link from the existing README to the guide.
- Do the work on the PC, in a work tree local to that issue.

## Done criteria

- [ ] The file at [guide document path] exists and has headings and explanations for the prerequisites, the order of running, checking that it runs correctly, and how to stop.
- [ ] The commands match the current settings of the repo, and the directory to run each command in is shown.
- [ ] The check that it runs correctly states the address to open and the screen or response the user should see.
- [ ] You can open the guide by following the relative path link in the README.
- [ ] The real changes, the verification commands that were run and their results, and the items not run with the reasons are recorded in `docs/changes/<real issue number>-agent-task.md`.

## How to verify

1. Compare the commands and the address in the document with the current settings, and check the document title and the targets of the relative path links.
2. This is a docs-only task, so do not add app tests or change existing tests. Check for regressions on the host with the existing `npm run check` and record the real result.
3. If you really followed the run guide to check it, leave the run environment and what you observed. If you could not run it because of permissions, dependencies, or DB limits, do not record it as done; write the reason and the verification that remains.
4. For a separate task that needs DB verification, use only the dedicated `TEST_DATABASE_URL` that is provided. If DB tests were skipped, tell them apart from a success.

## Out of scope

- Changing app code, settings, or existing tests, and adopting new tools
- Real deployment, and syncing separate repositories
- Reading, printing, or writing in docs any credentials, `.env`, real backups, or Terraform state
- The agent merging a PR, enabling auto-merge, or approving it

## Handling requirement changes

Example: if a request comes in during the work, "also add a troubleshooting section to the guide", keep the original goal of writing the guide and sort out the error cases to add and how to check them. Reflect "the cause and the fix of each confirmed error case can be read in the document" in the scope and the done criteria of the issue, and leave the reason for the change and the extra verification results in the work record.

If the request needs an app settings change, say which part conflicts with the current out-of-scope list, make the scope clear, and then go ahead. If a needed answer or permission is missing, hand over with the blocking reason and with the finished work and the remaining work kept apart. Do not record verification that was not run, or a feature that was not requested, as done.

## Local work and handover

1. The coordinator registers the real GitHub issue and prepares a branch that contains its number and a PC-local work tree.
2. The test owner checks the done criteria and the existing verification method, and the implementation owner writes the document and the work record in the same work tree. The implementation owner does not create the issue or the branch a second time and does not do commit, push, or PR work.
3. After the implementation, run the docs and link checks and the host regression check. The review owner reviews whether the requirement is met and the scope of the change, and when a finding is fixed the related verification is run again. Do not commit the change before verification and review pass.
4. The coordinator commits and pushes the verified change and creates or updates the PR. If a required verification could not be run, state that limit and hand over as a draft.
5. The user does the final review of the PR's changes and verification results and merges it directly. The agent does not replace the user's review with an approval or an auto-merge.
```

When writing it, check the project's [work instructions](../AGENTS.md), [implementation procedure](../skills/workout-implementation/SKILL.md), and [testing standard](../skills/workout-testing/SKILL.md). Compare the current way of running against the [README](../README.md). The split of roles above is an example for handing over to the local coordinator pipeline, and the real work follows the roles and the permission scope the user specifies.
