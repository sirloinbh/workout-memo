# Development baseline

The standards introduced in issue #4. Run the development commands at the root of the umbrella monorepo.

## Runtime

- Node.js 24.21.0 and npm 11.19.0. .nvmrc and .node-version are for choosing Node.
- engines in package.json and engine-strict in .npmrc block an incompatible install. packageManager states the npm version.
- Install with npm ci. To add or change a dependency, use npm install and commit package.json and package-lock.json together.
- npm workspaces manages the root lockfile. The separate lockfiles of frontend and backend are for the independent repositories and the Docker builds. When their package.json changes, update each of them with npm install --package-lock-only --workspaces=false in the same fixed Node and npm environment.
- On Windows, pick the Node version above with the version manager you use. This project does not change the system-wide Node automatically.
- CI and Docker builds use the same Node and npm baseline. .local is for local temporary tools and is not committed.

## Commands

| Command              | Role                                               |
| -------------------- | -------------------------------------------------- |
| npm ci               | Install exactly as the lockfile says               |
| npm run dev          | Frontend and API development servers               |
| npm run format       | Fix the format of supported files                  |
| npm run format:check | Check for format differences                       |
| npm run lint         | ESLint check, warnings also fail                   |
| npm run typecheck    | Type check of frontend, backend, and backend tests |
| npm test             | The existing unit and DB integration tests         |
| npm run build        | Production build                                   |
| npm run check        | Format → lint → types → app tests → build          |

DB tests need TEST_DATABASE_URL of a prepared dedicated DB. If it is not set, the integration tests are skipped, so it is not treated as full DB verification being done. CI prepares a separate PostgreSQL service and runs the real integration tests.

## Code rules

- Prettier: 2-space indent, single quotes, semicolons, LF, line length 100.
- ESLint: the recommended rules for JavaScript and TypeScript and the React Hooks rules. Formatting is left to Prettier.
- If you must keep an unused argument, such as in an Express error middleware, put _ in front of its name.
- At error boundaries, use unknown and type checks of the fields you need.
- Names: React components and types are PascalCase, and variables and functions are camelCase. Splitting into per-feature modules is done in the next step.
- .editorconfig fixes the editor settings, and .gitattributes fixes the line endings of the repo.
- Format the existing code once so that later format checks are reproducible. Keep changes to features, SQL, and screen behavior to a minimum.

## Work procedure

GitHub issue → issue-number branch → implementation and a docs/changes record per commit → PR after verification → automatic code review (at most 2 rounds) → merge after CI passes (before #128, the user merged directly). Skill PR #2 is a separate review target and is not merged on its behalf in this PR.

## Official references

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [typescript-eslint setup](https://typescript-eslint.io/getting-started/)
- [Prettier install and lockfiles](https://prettier.io/docs/install)
