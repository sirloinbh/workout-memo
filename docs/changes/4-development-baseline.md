# #4 Fix the development baseline

- Issue: https://github.com/sirloinbh/workout-memo/issues/4
- Parent roadmap: https://github.com/sirloinbh/workout-memo/issues/3
- Branch: chore/4-development-baseline

## Work commit: chore: 개발 실행 환경과 검사 기준 고정 (#4) (fix the development runtime and check baseline)

Fixes Node.js and npm, the install and lock files, and the commands for format, static checks, type checks, tests, and build. Aligns CI and Docker to use the same baseline, and cleans up format and check errors in the existing code.

## Changes

- Introduced Node.js 24.21.0 and npm 11.19.0, engines, packageManager, the version selection file, and engine-strict. The system Node install was not changed.
- Configured the supported ESLint 10, typescript-eslint, the React Hooks rules, Prettier, EditorConfig, and a line ending policy.
- Connected format, lint, frontend/backend/test type checks, tests, and build to npm run check.
- Added separate lock files based on npm ci, a Docker build with pinned versions, and CI. Allowing npm's esbuild install script is managed at the root and in the independent build targets. In npm workspaces, the child allowScripts is ignored and the root policy is used.
- The existing source was formatted once. Functional fixes were limited to removing unused imports, stabilizing React effect dependencies, handling unknown at error boundaries, and cleaning up test callback types.
- Aligned the backend Node types to the 24 line to match the Node runtime.

## Verification

- npm ci succeeded in a temporary Node 24.21.0 and npm 11.19.0 environment verified with the official distribution SHA-256.
- npm run check: format, lint, types, 4 tests (including the dedicated PostgreSQL integration test, skip 0), and frontend/backend builds passed.
- Created a workout_test_4 database separate from the existing user DB, applied the schema, and ran the tests.
- The frontend and backend Docker image builds passed. The final npm run check after the Node types update also passed.
- Re-running npm run format left all target files unchanged. git diff --check also passed.
- No screen features were added, so no browser interaction check was done. Introducing Playwright is a later step.

## Scope

API contracts, design, state management, extra test tools, and AWS deployment are later steps of the parent roadmap. The user merges the PR.

## Work commit: fix: 통합된 문서의 CI 포맷 오류 수정 (#4) (fix the CI format error in the merged docs)

- Failed run: https://github.com/sirloinbh/workout-memo/actions/runs/38523494441. In the Prettier check, the first step of `npm run check`, README.md and skills/workout-foundation/references/stack.md failed, so the later checks did not run.
- Fixed the blank line before the README heading and the alignment of the technology recommendation table to the existing Prettier standard. There is no change to check rules or app behavior, and the existing `format:check` detects a recurrence, so no separate app test was added.
- Reproduced the `prettier --check` failure of the two files locally before the fix, and the full format check passed after it.
- `npm run check` passed in the pinned Node 24.21.0 and npm 11.19.0 environment: format, lint, type checks, tests (pass 4, skip 0), and frontend and backend builds. DB verification used the existing dedicated workout_test_4 DB.
- The first local build failed because of a sandbox directory access limit, and the full check was re-run and passed after permission was approved.
- The skill validator `quick_validate.py skills/workout-foundation` did not run because the local Python lacks PyYAML. There is no change to SKILL.md, and the reference doc changed only in table whitespace. Confirmed that the target of the README's development baseline link exists.
