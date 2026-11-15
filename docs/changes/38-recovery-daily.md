# Recovery procedure for blocked issues and a daily work summary

- Issue: [#38](https://github.com/sirloinbh/workout-memo/issues/38)
- Branch: docs/38-recovery-daily
- Base date: 2026-10-15 (Asia/Seoul)

## Change

In docs/blocked-issues-recovery.md, I wrote the procedures for the formal re-handoff of the #17 tests, the host browser verification for #19, and the host full check and high-risk re-review for #26. I separated the currently installed runner, the features of #26 that are not enabled, snapshot and label updates, the retry conditions, and the workarounds that are prohibited.

In docs/daily/2026-10-15.md, I briefly recorded today's work and the status of priority, PRs, and workers, and linked the two documents from the README. I looked up the GitHub issue and PR status with the personal account sirloinbh and compared it with the local worker records. I did not actually unblock anything, change worker status, deploy to AWS, sync sub-repositories, or implement the app.

## Checks

- Prettier check of the 4 changed Markdown files with the existing Node 24.21.0: pass.
- Temporary Python check: 4 UTF-8 documents, 34 link targets (relative paths exist, external URL format), code blocks closed, and the installed runner supports accept-requirements/retry and does not support handoff-tests. All passed. This is not a check of external HTTP responses.
- With the existing local PyYAML set in PYTHONPATH and UTF-8 mode on, I ran quick_validate.py for workout-foundation / workout-implementation / workout-testing: 3 passed. No skill files changed.
- git diff --check and the staged diff check: pass.
- Only documents changed, so I skipped the local npm run check and the app/DB tests. I did not add feature tests for a document change. The CI result is checked separately on the PR.

## Follow-up: split the daily records and the next-steps directory

- Following a follow-up request from the user, I reused the existing #38 branch and PR #39. In docs/daily/README.md, I wrote the rules for accumulating by date, adding on the same day, and keeping the past. In docs/next-steps/README.md, I wrote the rule of updating the latest priorities and to-dos in the same file every day, and the current next work.
- I moved the recovery procedure to docs/next-steps/blocked-issues-recovery.md and fixed the relative links, the README, and the record for the day. The change description above, as written at that time, is kept as history.
- In AGENTS.md, I added the criteria for the main agent to manage the daily records and next-steps. I did not change skills, executable code, or worker status. I did not introduce an automatic scheduler.
- Prettier check of the 7 final changed Markdown files passed. In the 26 Markdown files of README, AGENTS, and docs, I checked 99 link targets (relative paths exist, external URL format), the daily file names and list links, and the move of the recovery document, and all passed. This is not a check of external HTTP responses.
- Re-ran quick_validate.py for the 3 project skills: pass. git diff --check and the staged diff check passed. Only documents and instructions changed, so I skipped the local app/DB check and npm run check. I did not actually do the recovery or resume the workers.

## Scope limits

The status is a snapshot at the time of checking. Today's summary is based on the conversation and the records I could check, and is not a total of all account activity. I did not actually run the recovery commands described, and I did not re-run the latest #17/#19/#26 tests in this work. Only the user merges PRs.
