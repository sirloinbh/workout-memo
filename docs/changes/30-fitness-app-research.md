# Fitness service research document and additional implementation backlog

- Issue: [#30](https://github.com/sirloinbh/workout-memo/issues/30)
- Branch: docs/30-fitness-app-research
- Reference date: 2026-10-15 (Asia/Seoul)

## Purpose and content of the change

I kept the following in docs/fitness-app-research-2026.md: the official features, prices, platforms, and web support of the 13 services researched in the conversation, the number of confirmed services in each of 11 feature areas, basic features and differentiators, the 2025 to 2026 trends, and review complaints. It states the unconfirmed items, the limits of app-store product prices, the Google Fit transition, and the differences in sources about JEFIT's release scope. I added an entry link to the README.

To avoid overlap with the existing #17/#27/#28/#29, I registered additional cards #31 to #35 and recorded their completion criteria, dependencies, and verification methods. I did not implement the extra features or register them in the worker queue. Lower-priority features were left as a separate review list.

## Verification

- Ran `prettier --check` with the existing Node 24.21.0 and Prettier on the 3 changed Markdown files: all 3 passed.
- With a temporary Python check, I confirmed the link reference definitions and relative paths in the changed documents, the 13 services, the service counts and denominators for the 29 feature rows, and the #30 to #35 links: passed (79 link targets and references). This is not a result of newly checking the response status of external URLs.
- Ran `quick_validate.py` on workout-foundation / workout-implementation / workout-testing: all 3 passed. The first run with the default Python failed because PyYAML was missing, and it passed when I re-ran it in UTF-8 mode with the existing ignored `.local/skill-validator` on PYTHONPATH. No skill files were changed.
- `git diff --check` and the staged diff check: found trailing whitespace used for Markdown line breaks, replaced it with blank lines, and the re-check passed.
- Confirmed the personal account sirloinbh and the repository remote, and re-fetched the number, title, and URL of the new issues #30 to #35.
- This change is only 3 Markdown documents, so I skipped the app/DB tests and `npm run check` locally. It is not reported as verification of an implemented feature. The PR's GitHub Actions are checked as a separate result.

## Limits and follow-up

I did not verify real service logins, payments, or device integrations. Competitor feature frequencies are the minimum counts I confirmed and are not market statistics. In this documentation I reused the existing research results and did not re-fetch external prices or features. The implementation and verification of app features proceed when each card is started, and only the user merges the PR.
