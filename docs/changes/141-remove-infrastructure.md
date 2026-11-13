# #141 Remove the infrastructure folder and related settings

- Issue: https://github.com/sirloinbh/workout-memo/issues/141
- Central tracking issue: https://github.com/sirloinbh/project-standards/issues/94

## Purpose

- The infrastructure source was moved to `sirloinbh/shared-aws-infrastructure` (sirloinbh/shared-aws-infrastructure#4). If the source is in two places, the history splits, so the copy in this repo is deleted.
- `infrastructure/` in this repo was already behind the source (AWS provider v5, while the source has v6.68.0).

## Change

| File                                                               | Content                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infrastructure/`                                                  | Deleted                                                                                                                                                                                                                                                                                                                  |
| `.github/workflows/ci.yml`                                         | Changed the `terraform` job to a `deploy-scripts` job. Only `bash -n` of `deploy/*.sh` remains                                                                                                                                                                                                                           |
| `scripts/push-repositories.ps1`, `scripts/create-repositories.ps1` | Removed infrastructure from the subtree targets                                                                                                                                                                                                                                                                          |
| `eslint.config.mjs`, `.prettierignore`                             | Deleted the `infrastructure/.terraform` ignore entry                                                                                                                                                                                                                                                                     |
| `AGENTS.md`, `AGENTS.project.md`                                   | Removed infrastructure from the subtree list, and made infrastructure changes follow the instructions of shared-aws-infrastructure                                                                                                                                                                                       |
| `README.md`                                                        | Fixed the infrastructure paths in the repository layout and the operations guide. The sentence "자동 운영 배포는 아직 연결되지 않았습니다" (automatic production deploy is not connected yet) was removed because it has not been true since #75                                                                           |
| `docs/deployment.md`                                               | Replaced the layout and cost, preparation, applying infrastructure, allowed IPs, alarms, and teardown with the guide in `docs/operations.md` of shared-aws-infrastructure. App deploy, rollback, automatic deploy, access, and backup restore were left as they were, and only the numbers were moved up                  |
| `skills/workout-foundation/references/procedures.md` (+ copy)      | Deleted infrastructure from the list of independent builds by area                                                                                                                                                                                                                                                       |

- `docs/ai-agent-project-setup.md` (new project setup guide), `docs/shared-hosting-costs.md`, `docs/changes/`, and `docs/daily/` show the state at that time, so they were not changed.

## What the user has to do

- If there is a PC that has the `infrastructure` remote registered locally, delete it. This PR does not change local settings.
- Merging this PR triggers the automatic production deploy. The app code did not change.

## Verification

- The `npm run check` result is written in the PR body.
