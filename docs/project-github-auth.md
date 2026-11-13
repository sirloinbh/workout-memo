# Project GitHub and Codex accounts

The source and the install method of the personal account tools (`gh-project.ps1`, `project-terminal.ps1`, and the account B VS Code launcher) are managed by [sirloinbh/project-standards `docs/tools.md`](https://github.com/sirloinbh/project-standards/blob/main/docs/tools.md) in the central repo. The install location is `%LOCALAPPDATA%\sirloinbh-tools`. This document describes only how this project uses them.

## Using GitHub

- The default `gh` is kept for the company account. Remote changes for this project, such as issues, pushes, and PRs, are made with the personal account `sirloinbh` and not with the default `gh`.
- In an interactive terminal, use `ghp`. The VS Code integrated terminal profile (`.vscode/settings.json`, a centrally managed file) calls `project-terminal.ps1` and creates the `ghp` function.
- Non-interactive workers and external PowerShell that do not have the function call the wrapper directly: `./scripts/gh-project.ps1 api user --jq .login` (a centrally managed file). The expected account is `sirloinbh`.
- For Git push and fetch, the local credential helper of this repo uses `%LOCALAPPDATA%\sirloinbh-tools\gh-project.ps1 auth git-credential`. The global helper and the company default authentication are not changed. If you clone again, set it again with the central `tools/set-credential-helper.ps1`.

The wrapper clears the inherited token, names the account explicitly with `auth token --hostname github.com --user sirloinbh`, and uses it only as `GH_TOKEN` for that call. If the account is missing, it fails instead of falling back to another account. After success or failure it restores the parent environment and passes the arguments, the exit code, and the stdin of a Git credential request through as they are. The token value is not left in docs or logs.

## Personal Codex profile

The official environment variable `CODEX_HOME` picks where Codex keeps its settings and state. This project uses the existing personal account B profile at `%LOCALAPPDATA%/Codex-Account-B` ([OpenAI configuration docs](https://learn.chatgpt.com/docs/config-file/config-advanced#config-and-state-locations)). The launcher only picks this home and does not change the login or how authentication is stored. A company account Codex conversation that is already running does not change automatically, so use a new project window and a new terminal.

## Verification

`node --test scripts/test/project-github-auth.test.mjs` — checks the account selection, the inherited token removal, the restore of the parent environment, and the passing of the arguments, the exit code, and stdin of the `scripts/gh-project.ps1` wrapper with a fake `gh` and a temporary environment. It is Windows-only and is skipped on other operating systems. The terminal initialization and the launcher checks are covered by the tests in `tools/` of the central repo.
