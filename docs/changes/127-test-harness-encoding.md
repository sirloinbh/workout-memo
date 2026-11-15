# #127 Test harness encoding failure for project-github-auth on non-ASCII paths

- Issue: [#127](https://github.com/sirloinbh/workout-memo/issues/127)
- Branch: `fix/127-test-harness-encoding`

## Purpose

When the repository is in a path with non-ASCII characters such as `...\OneDrive\문서\...` ("문서" means "Documents"), 6 tests in `scripts/test/project-github-auth.test.mjs` failed. The temporary harnesses (`.ps1` and `.cmd`) had the absolute path of the repository scripts written into them as a string, and Windows PowerShell 5.1 reads a `.ps1` without a BOM in the system ANSI code page (CP949), so `문서` became `???`.

## Change — 2026-10-22

- Instead of the BOM approach in the issue body, I fixed it by not writing the path into the harness files.
  - `cmd.exe` does not skip a UTF-8 BOM and treats it as a command. So a BOM cannot fix the `.cmd` harness (`launcher preserves another project ...`).
  - The harness bodies are collected into a `harnesses` constant at the top of the file and use only ASCII. The paths are passed through the environment variables `TEST_WRAPPER`, `TEST_TERMINAL_INIT`, `TEST_LAUNCHER`, and `TEST_OTHER_PROJECT`. Environment variables are passed as UTF-16 all the way, so the code page does not affect them.
- I added the regression test `harness scripts stay ASCII-only so a non-ASCII checkout path still runs them`. It checks that every harness is ASCII-only, does not contain the repository path, and reads the paths from environment variables. It also catches a regression of the `harnesses` constant on a machine with an ASCII path.
- The product code (`scripts/gh-project.ps1`, `scripts/project-terminal.ps1`) was not changed.

## Verification

Local (Windows 11, repository path `C:\Users\kimbh\OneDrive\문서\github\workout-memo`).

- `node --test scripts/test/project-github-auth.test.mjs`: 18 pass, 0 fail, 0 skip (17 existing + 1 regression). Before the fix, 6 failed.
- Regression check: when I put the absolute repository path back into the `restore` harness, the regression test failed with `restore harness must stay ASCII-only`. It passed after I reverted.
- After fast-forwarding to `origin/main` (#130 merge `5875ad3`), I ran it again. Because of the new devDependency in #130, I synced the dependencies with `npm ci --ignore-scripts`.
- `npm run check` (no DB)
  - format, lint, contract, typecheck passed
  - backend 206 pass / 35 skip (DB integration not run), frontend 121 pass
  - `test:agents` 165 pass / 2 fail. The 2 failures (`#24 ... crosses the PowerShell and Node boundary`) are caused by the PowerShell execution policy of this PC and have nothing to do with this change (same as the #130 record).
  - I ran `test:agents` again with the process-only `PSExecutionPolicyPreference=Bypass` and confirmed 167 pass. Then `test:skills` 4 pass, `test:docs` 3 pass, `build` succeeded.

## First automatic review — 2026-10-22

A separate read-only review agent reviewed the whole diff of PR #132. There was no correctness defect. It confirmed 18 pass again on a non-ASCII path.

1. **minor**: The regression test checks only the `harnesses` constant, so it cannot catch a harness written again as an inline template in the test body. The statement in the document, "it also catches the regression on an ASCII path machine", was also too broad.
   - Applied: the regression test checks that the argument of every `writeFileSync(harness, ...)` in the source of this test file is `harnesses.<name>`. I narrowed the wording in the document.
2. **nit**: The regular expression for the environment variable check could also match `TEST_EXIT`, which has nothing to do with paths. Applied: narrowed to `TEST_(WRAPPER|TERMINAL_INIT|LAUNCHER|OTHER_PROJECT)`.
3. **nit (out of scope)**: `gh.cmd` and `code.cmd` in the fixtures have `process.execPath` written in. If Node is installed in a non-ASCII folder, the same kind of problem could happen. It has nothing to do with the checkout path and is outside the #127 completion criteria; there is no environment to reproduce it now, so I did not split it into an issue and only record it.

### First fix verification

- `node --test scripts/test/project-github-auth.test.mjs`: 18 pass / 0 fail / 0 skip
- Regression check: when I changed `writeFileSync(harness, harnesses.restore)` in the `restore` test to an inline template, it failed with `harness content must come from harnesses`. It passed after I reverted.
- `prettier --check` and `eslint`: passed for the changed files

## Second automatic review — 2026-10-22

A separate read-only review agent reviewed the first fix (`85d75d9`) and the final whole diff. Comments 2 and 3 were handled properly. Comment 1 was only partly applied.

- **minor**: The source check regular expression only matched when `writeFileSync(harness, ` was on one line. Prettier splits a long inline harness into `writeFileSync(\n  harness,\n  ...\n);`, so the form that would really be committed was missed. The "regression check" of the first review also verified only the one-line form that prettier rejects.
  - Applied: changed to `/writeFileSync\(\s*harness\s*,\s*([\s\S]*?)\s*,?\s*\);/g`, which allows spaces and line breaks.
- Remaining limit: if a harness is written with a variable that is not named `harness`, this check misses it. I leave it on record.
- Reviews are at most 2, so there is no further review after this fix.

### Second fix verification

- Regression check: I changed the `restore` test to a multi-line inline template that contains the repository path and ran `prettier --write` so that it became the multi-line form. The regression test failed with `harness content must come from harnesses`. It passed after I reverted.
- `node --test scripts/test/project-github-auth.test.mjs`: 18 pass / 0 fail / 0 skip
- prettier and eslint on the changed files passed
