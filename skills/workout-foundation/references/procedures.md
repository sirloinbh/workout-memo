# Verified repeatable procedures

These are procedures that were actually run, with results checked, in steps 2 to 4 of roadmap #3 (#58, #60, #62, #64, #66, #68). Repeat them as they are when doing the same kind of work in this repo. The reasons and the results are in each `docs/changes/<number>-*.md`.

## 1. Adding an npm package

Under the global rules, installing or removing npm packages needs the user's explicit acknowledgement of the risk. After you get it, proceed in this order.

1. **Check the candidate**: with read-only `npm view`, check the publisher, the repository, the publish date of each version, peer dependencies, engines, and install scripts.
   - Pick the newest version that was published at least 14 days ago. Supply-chain attacks happen in fresh releases.
   - Check that the peer ranges match the installed React, Vite, Zod, and Node. Examples: react-router 8 needs react >= 19.2.7, and vitest 5 needs vite >= 6.4.
2. **User confirmation**: get confirmation once, with the exact list of packages and versions and the risk notice.
3. **Install**: `npm install --ignore-scripts --save-exact [-w <workspace>] <pkg>@<version>`.
4. **Check after install**
   - Check that no package other than the existing esbuild and fsevents has `hasInstallScript` in the lockfile.
   - Record the list of newly added packages.
   - Search for IOC strings (webhook.site, ngrok.io, and so on) and suspicious workflows.
5. **Regenerate the lockfile for the subtrees**: `frontend/` and `backend/` run `npm ci` inside Docker with their own `package-lock.json`. Regenerate this lockfile by copying that `package.json` and the existing lockfile into a temporary directory, running `npm install --package-lock-only --ignore-scripts --before=<date 14 days ago>`, and copying the result back. Transitive dependencies follow the same date cutoff.
6. **Check the Docker build**: `docker build ./frontend`, `docker build ./backend`. In the monorepo a build can pass thanks to hoisting and still fail when built alone (this really happened in #60).
7. **Record**: write the versions, the selection criteria, and the check results in docs/changes and the PR.

## 2. Keeping per-area builds independent

- `frontend`, `backend`, and `database` are built separately in their own Docker contexts and subtree repositories. Do not write app code that imports from a path outside its own area.
- If two areas must use the same code, keep one source and one copy and check them. Examples:
  - `shared/contract.ts` → `contract:sync` and `contract:check`
  - `skills/` → `.claude/skills/`
- Tests may import another area's source. In exchange, the frontend build excludes tests and `vite.config.ts` through `tsconfig.build.json`, and the whole-repo type check is done by the monorepo `npm run typecheck`.

## 3. Screen refactoring

1. **Behavior tests first**: RTL tests that verify by the roles, labels, and text the user sees must exist first. Tests that imitate internal hooks or state break on a refactor. That is why #60 moved the vm harness tests to RTL before #62, #64, and #66.
2. **Check behavior is preserved**: only the way the tests navigate should change in a refactor. Example: menu button → link (`openPage`). If an assertion changes, write the reason in the docs. Fix test data that differs from the real server, such as invalid input that only a mock accepted, to match the real contract.
3. **Check appearance is preserved**: for changes that must not change the look (tokenizing, extracting components, adopting a CSS tool), compare pixels in real Chrome.
   - Freeze the browser clock and turn off animations. Take full-screen shots of the main pages and modals on desktop and mobile, before and after the change.
   - Take the baseline twice first and confirm the difference is 0, then compare against the after-change shots.
   - Use the screenshot spec and the comparison script only temporarily and do not commit them. Record the results (number of shots, differing pixels).
4. Do not widen the scope to fix an existing defect found during verification; register a separate issue. Example: #71, horizontal overflow on mobile.

## 4. Stacked PRs

- If you must continue to the next step before the earlier PR is merged, create the new branch from the earlier branch. The PR target is always `main`.
- Write the merge order on the first line of the PR body. Also say that, until the earlier PR is merged, the diff shows the earlier commits too.
- If a lower branch needs a fix, commit to that branch, then `git merge` it into each upper branch in order and push. Do not rewrite the PR history with a force push.
- Fix the docs/changes record of each PR on that PR's branch. Do not edit a lower PR's doc from an upper PR.
- Merge from the lowest PR up, in order. When an earlier PR is merged, merge `origin/main` into the next branch, resolve conflicts, re-run the tests, and push. Merge once CI passes, and repeat to the end of the stack.

## 5. Docs and contract artifacts

If the following artifacts drift from the code, `npm run check` fails. Commit the generator output with the change.

| Artifact                                              | Update command                                    | Check                              |
| ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `docs/api.md` endpoint table                          | Edit by hand                                      | `api-contract.test.ts`             |
| `docs/openapi.json`                                   | `npm run openapi`                                 | `openapi.test.ts`                  |
| `backend/src/contract.ts`, `frontend/src/contract.ts` | `npm run contract:sync`                           | `contract:check`                   |
| `.claude/skills/`                                     | `npm run skills:sync`                             | `test:skills`                      |
| DB schema                                             | Add a new numbered file to `database/migrations/` | `migrations.test.ts`, `db:migrate` |
