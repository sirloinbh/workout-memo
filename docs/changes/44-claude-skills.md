# #44 Copy and sync the Codex project skills as Claude Code skills

- Issue: [#44](https://github.com/sirloinbh/workout-memo/issues/44)
- Branch: `chore/44-claude-skills`

## Change

- I copied the repo's source `skills/workout-foundation` (including the reference `references/stack.md`), `skills/workout-implementation`, and `skills/workout-testing` as they are into `.claude/skills/`, the Claude Code project skills location. The skill bodies have no repo-relative links, so no links break when the location changes.
- The source is still `skills/`. In the Codex account B install (`%LOCALAPPDATA%/Codex-Account-B/skills`), `workout-foundation/references/stack.md` was older than the repo, but that is outside the scope of this work, so I did not change it.
- `scripts/claude-skills.mjs`: `sync` rebuilds `.claude/skills/` to be identical to the source (files deleted from the source are removed too). Run with no arguments, it prints missing, changed, and extra files and exits with 1. A difference only in line endings (CRLF/LF) counts as the same content. If there is a symbolic link, it stops.
- `package.json`: added `skills:sync`, `skills:check`, and `test:skills`. I connected `test:skills` to `check`, so a mismatch of the copies fails the local full check and CI.
- I wrote the location of the copies and the sync procedure in AGENTS.md and README.md.
- I added `.bkit/` and `.playwright-mcp/`, local outputs made by Claude Code plugins and tools, to `.gitignore` and `.prettierignore`. In the first full check, `.bkit/*.json` was picked up by the Prettier check and it failed.

## Checks

- `node --test scripts/test/claude-skills.test.mjs`: **4 pass / 0 fail / 0 skip** (sync, detecting changes and extras and cleaning up, ignoring line endings, and matching the real repo).
- Ran the skill-creator `quick_validate.py` (PYTHONUTF8=1) on the three skills in `.claude/skills/`: all `Skill is valid!`. Without UTF-8 mode, a read error occurs because of the Windows cp949 default encoding.
- `npm run check` on host Node 24.21.0 / npm 11.19.0 with a dedicated test DB: **exit 0**. App and DB 118 pass, workers 86 pass, skills 4 pass, all with 0 fail/skip, and the frontend/backend builds pass. (The result of the re-run after adding the ignores is recorded in the PR.)

## Resolving the main merge conflict — 2026-10-19

- Merging PR #42 (#26) grew the `test:agents` list on main, and `package.json` conflicted. I kept the full `test:agents` list from main and also kept this work's `test:skills`, `skills:sync`, `skills:check`, and the `check` wiring.
- Host `npm run check` on the merge result: **exit 0** — app and DB 118 pass, workers 162 pass, skills 4 pass, all with 0 fail/skip, and the build passes.
