# #174 Add test outputs and personal settings files to .gitignore

- Issue: [#174](https://github.com/sirloinbh/workout-memo/issues/174) (central sirloinbh/project-standards#323)

## Change

I added the items below to the `# --- project ---` section of `.gitignore`. The shared part is a centrally managed file, so I did not touch it, and applying it to the central template is handled in project-standards#323.

| Item                          | Reason                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob-report/`                | Playwright blob reporter output                                                                                                                                                                               |
| `coverage/`                   | Vitest coverage output                                                                                                                                                                                        |
| `*.tsbuildinfo`               | TypeScript incremental build cache                                                                                                                                                                            |
| `*.tfvars`                    | Terraform variable files. They may contain secrets. After `infrastructure/` was moved out of the repo in #141, the `infrastructure/terraform.tfvars` left locally was showing up as a candidate to be tracked |
| `.claude/settings.local.json` | Personal Claude Code permission settings. The shared settings `.claude/settings.json` are still tracked                                                                                                       |

## Verification

- `git check-ignore -v --no-index`: all the new item paths (`infrastructure/terraform.tfvars`, `blob-report/x`, `coverage/index.html`, `frontend/tsconfig.tsbuildinfo`, `.claude/settings.local.json`) are ignored by the new rules. The existing `.bkit/`, `.playwright-mcp/`, and `test-results/` are also ignored.
- `.claude/settings.json` and `.env.example` are not ignored (`git check-ignore` exit code 1).
- I confirmed with `git ls-files` that no tracked file matches the new patterns.
- `npm run standards:check` (local): there is no difference in `.gitignore`. It failed because the 4 shared packages (`@sirloinbh/*`) are not installed in the local `node_modules`. I did not install (`npm ci`) because of the global rule, and the full check is confirmed with the PR CI result.
- `npm run format:check` (local): I could not run it for the same reason (`@sirloinbh/prettier-config` is not installed).
- The `verify` of the first PR CI failed the Prettier check because of the table alignment of this document. I ran the installed Prettier with the same settings as the central `packages/prettier-config/index.json` to align the table, and `--check` passed.
- There is no app code change, so I did not run `npm run check`.

## Follow-up

- When project-standards#323 is merged, the same items come into the shared part through the sync PR. Then delete the duplicate items in the project section.
