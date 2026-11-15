# Setting up the development environment for a new web app project — handoff document for AI agents

This document is instructions to pass as-is to the **AI agent that will set up a new web app project** (Claude Code, Codex and so on). It is based on the development environment actually run and verified in `sirloinbh/workout-memo`. The agent reads this document from start to finish and then proceeds in the order of the [11. Bootstrap checklist](#11-bootstrap-checklist).

- As of: 2026-10-19 (Asia/Seoul). The version numbers are the values whose behavior was actually verified on that day. When you start a new project, check the official support status again and record the reason if you change a version.
- Notation: **[Currently applied]** means installed and in use in workout-memo, and **[Recommended, not adopted]** means reviewed only and not installed yet. Do not treat a tool that is not adopted as if it were installed.

## 0. Values to confirm with the user before you start

The placeholders below differ for each project. If a value is not decided, **ask the user before you start setting up.** Do not decide it yourself.

| Placeholder          | Meaning                                                    | workout-memo example                                                                    |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `<app>`              | Base name of the app and repository (lowercase, hyphens)   | `workout-memo`                                                                          |
| `<App display name>` | Name used on screens and in docs                           | `FORM · 나의 운동 기록` (FORM · My Workout Log)                                         |
| `<owner>`            | GitHub account (personal or organization)                  | `sirloinbh`                                                                             |
| `<db>`               | PostgreSQL DB and user name                                | `workout`                                                                               |
| `<web-port>`         | Production-style local web port (bound to 127.0.0.1)       | `8101` (central registry slot formula 8100 + n)                                         |
| `<db-port>`          | DB port used from the host                                 | `15401` (central registry slot formula 15400 + n)                                       |
| `<api-port>`         | Internal API port                                          | `3101` (central registry slot formula 3100 + n)                                         |
| `<timezone>`         | Service reference time zone                                | `Asia/Seoul`                                                                            |
| `<region>`           | AWS region                                                 | `ap-northeast-2` (Seoul)                                                                |
| `<budget-usd>`       | Monthly AWS budget alert threshold                         | `20`                                                                                    |
| Users and login      | Number of users, whether login is needed                   | Single user, no login → never expose it externally                                      |
| Domain rules         | Core rules such as dates, units and unconfirmed values     | Date `YYYY-MM-DD`, weight is total weight in kg, unconfirmed values are NULL            |
| GitHub account split | Whether a company account and a personal account are mixed | The default `gh` is the company account; this project uses the personal account wrapper |

## 1. Absolute rules (constraints on agent behavior)

Copy these into the new project's `AGENTS.md` as they are.

1. **Install or remove npm packages only after the user reconfirms.** The 2025 to 2026 npm supply chain attacks (the Shai-Hulud family) steal tokens through the `postinstall` hook. This covers `npm install/i/add/uninstall/update/ci`, `npx <package>`, `pnpm/yarn/bun install`, and `corepack enable/prepare`. If an install is needed, follow this order.
   - Show the user the package list with the publisher, recent releases and the GitHub repository, and recommend checking socket.dev, Snyk Advisor and deps.dev.
   - Run it when the user says explicitly "I understand the risk, go ahead". Propose `--ignore-scripts` first.
   - Only for packages whose build really needs an install script (for example `esbuild`), list them in `allowScripts` in `package.json`.
   - Commands that do not come with an install, such as `npm run <script>`, `npm ls` and `npm view`, are allowed.
2. **After a PR goes through automatic code review at most 2 times, the agent merges the PR when the required CI passes.** Apply review improvements in an additional commit (do not re-review after the second round of fixes), and split a large fix into a new issue card. Merge only the commit you verified, with `--merge --match-head-commit`; for consecutive PRs, merge main, resolve conflicts, get CI passing again, and then merge. Do not merge while a check is failing or running, bypass protection rules, approve your own PR, push directly to `main`, or force-push.
3. **Do not put secrets in the repository, docs, PRs or logs.** This covers `.env`, tokens, real backups and Terraform state. Commit only `.env.example`.
4. **Do not overwrite user changes.** Do not use `git add -A`; stage files by name. Check the target before you revert or delete.
5. **Do not report a check you did not run as passed.** Record skipped DB tests, browser checks not run, and anything not deployed as separate items.
6. **If a requirement is missing, ask.** Confirm the rules that must be decided before implementation (how to aggregate, policy, scope) with the user, together with a recommendation, and record them in the issue.

## 2. Language and document rules

- App screen text and replies to the user are written in **English** (sirloinbh/project-standards#453). Documents (README, docs, issues, PRs) follow the central writing rules. Code identifiers, commit title prefixes (`feat:` and so on), and code comments are English by default.
- Server validation error messages that users can see are written in English too. Give each message explicitly, such as `.min(1, '…')`, so Zod's default messages ("Array must contain…") do not reach the screen unchanged.
- Dates are `YYYY-MM-DD` and the service time zone is `<timezone>`. Compute the server's "today" in the service time zone, not the server's time zone.
- Document locations:
  - `docs/changes/<issue-number>-<slug>.md`: change record per issue. Leave the purpose, the change, the actual verification commands with pass/fail/skip, and the limits.
  - `docs/daily/YYYY-MM-DD.md`: summary of the working day. Accumulate by date and add it to the list in `docs/daily/README.md`.
  - `docs/next-steps/README.md`: latest priorities, blockers and next actions. Update it every day.

## 3. Technology stack

### 3.1 [Currently applied] Versions and roles

| Area            | Choice                                              | Version (pinned/range)                                     | Role                                                   |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Runtime         | Node.js / npm                                       | `24.21.0` / `11.19.0` (pinned exactly)                     | Same for development, CI and Docker                    |
| Package layout  | npm workspaces                                      | Root + `frontend`, `backend`                               | One root lockfile + lockfiles for the sub-repositories |
| Frontend        | React, React DOM                                    | `^19.1.0`                                                  | SPA                                                    |
|                 | Vite                                                | `^6.3.5`                                                   | Dev server and build, `/api` proxy                     |
|                 | TypeScript                                          | `^5.8.3`                                                   | `strict`                                               |
|                 | lucide-react                                        | `1.52.0`                                                   | Icons                                                  |
| Backend         | Express                                             | `^5.1.0`                                                   | REST API                                               |
|                 | pg (node-postgres)                                  | `^8.16.0`                                                  | Hand-written SQL, no ORM                               |
|                 | Zod                                                 | `^3.25.0`                                                  | Server input validation                                |
|                 | tsx                                                 | `^4.19.0`                                                  | Development run (`watch`) and test run                 |
| DB              | PostgreSQL                                          | `17` (`postgres:17-alpine`)                                | Single DB                                              |
| Web server      | nginx                                               | `1.27-alpine`                                              | Static files + `/api` reverse proxy                    |
| Code quality    | ESLint / typescript-eslint / react-hooks / Prettier | `10.12.0` / `8.71.2` / `7.1.1` / `3.9.10` (pinned exactly) | Warnings also fail                                     |
|                 | `@eslint/js`, `eslint-config-prettier`, `globals`   | `10.0.1`, `10.1.8`, `16.5.0`                               |                                                        |
| Dev convenience | concurrently                                        | `^9.2.0`                                                   | Run the API and web together                           |
| Tests           | `node:test` + `tsx --test`                          | Node built-in                                              | Unit, DB integration, UI (chapter 6 below)             |
| Containers      | Docker Compose                                      | —                                                          | 3 services: db, api, web                               |
| CI              | GitHub Actions                                      | —                                                          | Full check + DB integration + Docker build             |
| Infrastructure  | Terraform / AWS provider                            | `>= 1.6.0` / `~> 5.0`                                      | ECR and budget alerts (deployment is not connected)    |

### 3.2 [Recommended, not adopted] Candidates to adopt when needed

| Area         | Candidate                                 | When to adopt                                                                                     |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Routing      | React Router                              | When there are more than 4 or 5 screens and you need shareable URLs and a back button             |
| Server state | TanStack Query                            | When the code for fetching, caching and refreshing after a save starts to repeat                  |
| Forms        | React Hook Form + Zod                     | When array inputs and per-item errors get complicated                                             |
| UI           | Tailwind CSS + shadcn/ui                  | When shared components grow. Move the existing design tokens first                                |
| Charts       | Recharts                                  | When hand-drawn SVG charts are not enough                                                         |
| Tests        | Vitest, React Testing Library, Playwright | When you need automatic browser regression. Do not rip out the existing `node:test` for no reason |
| API contract | OpenAPI                                   | When external clients appear                                                                      |
| ORM          | Prisma                                    | Only when the user asks for an ORM switch. Do not split the source of migrations in two           |

If you want to use the candidates above from the start in a new project, get the user's confirmation as in rule 1 of chapter 1 and then adopt them. When you adopt one, update the run commands, CI and docs in the same PR.

## 4. Repository layout and splitting the repositories

### 4.1 Umbrella monorepo + sub-repositories for deployment

- Develop all source in **one umbrella monorepo, `<owner>/<app>`.** Issues, branches, PRs and reviews all happen here.
- The four per-area repositories are synced with `git subtree split` **only for deployment and sharing.** During everyday PR work, do not push directly to a sub-repository or to `main`.

| Prefix folder     | Sub-repository (private)            | Contents                                      |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| `frontend/`       | `<owner>/<app>-frontend`            | React app, Dockerfile, nginx.conf, its own CI |
| `backend/`        | `<owner>/<app>-backend`             | Express API, Dockerfile, its own CI           |
| `database/`       | `<owner>/<app>-db`                  | SQL migrations, README                        |
| `infrastructure/` | `<owner>/shared-aws-infrastructure` | Terraform shared by several apps, its own CI  |

- First creation: `scripts/create-repositories.ps1 -Owner <owner>`. It creates 5 repositories, splits each prefix folder into an `export/<part>` branch, and pushes it to the `main` of the sub-repository.
- Sync: `scripts/push-repositories.ps1`. Run it **only when the user asks for a sync** (because it also pushes the umbrella `main`).
- If someone edited a sub-repository directly, first pull it in with `git subtree pull --prefix=<part> <url> main --squash`.
- So that a sub-repository builds on its own, put each one's own `package-lock.json`, `.github/workflows/ci.yml`, `.gitignore` and `.dockerignore` in `frontend/` and `backend/`.

### 4.2 Directory layout

```text
<app>/
├─ AGENTS.md                 # Shared AI instructions (Codex baseline, Claude reads it too)
├─ CLAUDE.md                 # [Recommended] "Follow AGENTS.md" + Claude-only differences
├─ README.md
├─ package.json              # workspaces, shared scripts, lint and format tools
├─ package-lock.json
├─ .nvmrc / .node-version    # 24.21.0
├─ .npmrc  .editorconfig  .gitattributes  .gitignore
├─ .prettierrc.json  .prettierignore  eslint.config.mjs
├─ .env.example              # Example only, no secrets
├─ compose.yaml
├─ .github/workflows/ci.yml  # Integrated CI
├─ frontend/  backend/  database/  infrastructure/
├─ scripts/                  # Scripts for repository creation, sync, backup and checks
├─ skills/<app>-*/SKILL.md   # Source of the AI work procedures
├─ .claude/skills/           # Copy for Claude Code (npm run skills:sync)
└─ docs/  changes/  daily/  next-steps/
```

- `.local/` is for local tools, temporary worktrees and logs. Exclude it from Git and Prettier.
- As features grow, do not keep every screen in a single `frontend/src/main.tsx`; split it into feature modules (`routines.tsx`, `body.tsx` and so on). In workout-memo `main.tsx` grew large and concurrent PRs conflicted often.

## 5. Core configuration files

Below is the actual content used in workout-memo. Replace only the names and ports with placeholders.

### 5.1 Runtime, editor and line endings

`.nvmrc`, `.node-version`

```text
24.21.0
```

`.npmrc`: block installs with an engine mismatch, and save dependency versions exactly.

```ini
engine-strict=true
save-exact=true
```

`.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.gitattributes`: LF in the repository, CRLF only for PowerShell scripts.

```text
* text=auto eol=lf
*.ps1 text eol=crlf
```

### 5.2 Root `package.json`

```json
{
  "name": "<app>",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -k \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "build": "npm run build -w frontend && npm run build -w backend",
    "test": "npm run test -w backend",
    "test:skills": "node --test scripts/test/claude-skills.test.mjs",
    "skills:sync": "node scripts/claude-skills.mjs sync",
    "skills:check": "node scripts/claude-skills.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:skills && npm run build",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "npm run typecheck --workspaces"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "concurrently": "^9.2.0",
    "eslint": "10.12.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "16.5.0",
    "prettier": "3.9.10",
    "typescript-eslint": "8.71.2"
  },
  "allowScripts": { "esbuild@0.28.2": true, "esbuild@0.25.12": true },
  "engines": { "node": "24.21.0", "npm": "11.19.0" },
  "packageManager": "npm@11.19.0"
}
```

The single `npm run check` runs format → lint → types → tests → build. **Always run it before a commit and before you create or update a PR.** The local AI worker uses the runner in the central repo, so do not put worker tests in the app's `check`.

### 5.3 Format and lint

`.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.prettierignore`

```text
node_modules/
**/dist/
.local/
.git/
.env
package-lock.json
**/package-lock.json
infrastructure/.terraform/
**/*.tfstate*
backups/
.bkit/
.playwright-mcp/
```

`.bkit/` and `.playwright-mcp/` are local outputs made by Claude Code plugins and browser tools. If Prettier checks these folders, `npm run check` fails.

`eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', 'infrastructure/.terraform/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
  prettier,
);
```

Code rules: write React components and types in PascalCase, and variables and functions in camelCase. Prefix an argument that must be declared but is not used (such as an Express error middleware) with `_`. At error boundaries, take the value as `unknown` and check only the fields you need.

### 5.4 `.gitignore`

```text
node_modules/
dist/
.env
*.log
.terraform/
*.tfstate*
*.tfplan
backups/
.local/
.bkit/
.playwright-mcp/
```

### 5.5 TypeScript

`frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`backend/tsconfig.json` (build) and `backend/tsconfig.check.json` (type-check including tests)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": ["src", "test"] }
```

### 5.6 Workspace `package.json` scripts

- frontend: `"dev": "vite --host 127.0.0.1"`, `"build": "tsc --noEmit && vite build"`, `"typecheck": "tsc --noEmit"`
- backend: `"dev": "tsx watch --env-file-if-exists=../.env src/server.ts"`, `"start": "node dist/server.js"`, `"build": "tsc"`, `"test": "tsx --test test/*.test.ts"`, `"typecheck": "tsc -p tsconfig.check.json"`
- Both workspaces have `engines`, `packageManager` and `"allowScripts": { "esbuild": true }`.

`frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:<api-port>' } } });
```

### 5.7 Docker Compose and images

`compose.yaml`: bind every port only to `127.0.0.1` (to protect an app with no login).

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-<db>}
      POSTGRES_USER: ${POSTGRES_USER:-<db>}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Copy .env.example to .env and set password}
      TZ: <timezone>
    ports: ['127.0.0.1:<db-port>:5432']
    volumes:
      - <app>-data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB']
      interval: 5s
      timeout: 5s
      retries: 15
    restart: unless-stopped
  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-<db>}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-<db>}
      PORT: <api-port>
      TZ: <timezone>
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  web:
    build: ./frontend
    ports: ['127.0.0.1:<web-port>:80']
    depends_on: [api]
    restart: unless-stopped
volumes:
  <app>-data:
```

`.env.example`

```ini
POSTGRES_DB=<db>
POSTGRES_USER=<db>
POSTGRES_PASSWORD=change-this-local-password
DATABASE_URL=postgres://<db>:change-this-local-password@localhost:<db-port>/<db>
PORT=<api-port>
```

`backend/Dockerfile`: split build and run, and run the run stage as a non-root (`node`) user.

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE <api-port>
CMD ["node", "dist/server.js"]
```

`frontend/Dockerfile` + `frontend/nginx.conf`

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location /api/ { proxy_pass http://api:<api-port>; proxy_set_header Host $host; }
  location / { try_files $uri $uri/ /index.html; }
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
}
```

## 6. Backend and DB implementation rules

### 6.1 API structure

- `createApp(pool)` builds and returns the Express app, and `server.ts` only calls `listen`. Then tests can start the app with a real DB pool or a fake pool. To fix "today" in tests, provide an injection point such as `createApp(pool, { today })`.
- `app.disable('x-powered-by')`, `express.json({ limit: '256kb' })`. Raise the limit separately only on a route that takes large uploads (for example a backup restore).
- Validate every input with Zod before it touches the DB. A shared error middleware turns `ZodError` into 400 and a unique constraint violation (23505) into 409, with Korean-language messages.
- Check the status with `GET /api/health`.
- Receive the pg `date` type (OID 1082) as a string: `types.setTypeParser(1082, (v) => v)`. This prevents it from turning into a JS `Date` and shifting the time zone.
- Wrap a change that writes several rows (a log plus its sets and so on) in `BEGIN … COMMIT` on one client, `ROLLBACK` on an error, and `release()` in `finally`.
- Every query uses parameters (`$1`). If you must build a table or column name as a string, use only constants.

### 6.2 Save-safety patterns (apply to the apps that need them)

- **Idempotent retry:** the client attaches a UUID `Idempotency-Key` to POST/PUT.
  - Inside a transaction, the server serializes the same key with `pg_advisory_xact_lock(hashtextextended(key))`.
  - It stores the request fingerprint (method, target and the SHA-256 of the normalized body) and the response, and returns the same response for the same request.
  - If the same key is used with different content, it rejects with 409.
- **Concurrent edit conflicts:** put a `version` on the row, run `SELECT … FOR UPDATE`, and compare the version. If it differs, return 409; if it matches, update with `version+1`.
- **Browser draft:** keep the content being typed in `localStorage` (for example for 7 days) and show the save state. Wrap every storage access in `try/catch` (private mode, quota exceeded).

### 6.3 DB and migrations

- PostgreSQL 17. Keep the source of migrations in **one place only**, `database/migrations/NNN_<description>.sql`.
- Number them with a 3-digit sequence. **Reserve the number when you start work so parallel branches do not use the same number.** In workout-memo, PRs opened at the same time have used `003` twice.
- Write every migration so it is safe to re-run: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and seed data with `INSERT … ON CONFLICT DO NOTHING/UPDATE`.
- Preserve the meaning of existing data. For example, give a new `completed` column the default `true` so the judgment of past records does not change.
- How to apply:
  - Empty volume: Compose runs every file in `/docker-entrypoint-initdb.d` automatically, in name order.
  - CI: apply every file in name order with `psql -v ON_ERROR_STOP=1 -f`.
  - **Existing DB: run the file mounted in the container directly.**

    ```powershell
    docker compose exec -T db psql -U <db> -d <db> -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/NNN_<description>.sql
    ```

    **Do not pass the file through a PowerShell pipe**, as in `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII when piping to an external program, so Korean text breaks into `?`. In workout-memo we reproduced the `'기타'` ("Other") brand being stored twice as `'??'`. If you have to pipe, first set `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`.
- Where possible, write Korean literals in SQL (CHECK values and so on) with a Unicode escape such as `U&'\AC00\C2B4'`. It is safe regardless of the apply path.
- State the unit and NULL rules in the schema. Keep an unconfirmed value as NULL and distinguish it from 0. Set numeric precision with `NUMERIC(p,s)`.
- Backup: `scripts/backup.ps1` saves `pg_dump --no-owner --no-acl` as a UTF-8 (no BOM) file. `backups/` is excluded from Git; also keep it in safe storage off the PC and check restores periodically.

## 7. Tests and CI

### 7.1 Test principles

- Put the tests in the same commit as the implementation or fix. For a bug fix, add a regression test for which you confirmed **fail before the fix → pass after the fix**.
- Do not just repeat the internal implementation; verify the result the user sees and the domain rules.
- Do not make a failing test pass by skipping it, deleting it or weakening its assertion.

### 7.2 Kinds of tests [Currently applied]

| Kind           | Tool and method                                                                                                                                          | Example files                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Unit           | `node:test` + `assert/strict`, `tsx --test`                                                                                                              | `backend/test/*.test.ts`          |
| DB integration | A real PostgreSQL. **Skipped** when `TEST_DATABASE_URL` is not set. A skipped test does not count as a pass                                              | `*.integration.test.ts`           |
| UI             | Load the component with `vm.runInNewContext` + `ts.transpileModule`, and check the render result with a fake React, `fetch`, `localStorage` and clock    | `*-ui.test.ts`                    |
| Browser        | A real dev server + Playwright (MCP) to check mobile 390px and PC 1440px. It is a manual check before the PR, not a replacement for automatic regression | Record the result in docs/changes |

- Run DB integration tests **only on a dedicated test DB, never on the user's DB.** So parallel work does not interfere, use a DB per branch (issue) or a schema per test.
- For a date-dependent test, inject "today" or fix it with a fake `Date`.

### 7.3 Integrated CI (`.github/workflows/ci.yml`)

```yaml
name: Verify application
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: <db>, POSTGRES_PASSWORD: test, POSTGRES_DB: <db> }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.21.0', cache: npm }
      - run: npm install --global npm@11.19.0
      - run: npm ci
      - run: |
          for migration in database/migrations/*.sql; do
            psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || exit 1
          done
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }
      - run: npm run check
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t <app>-frontend:ci ./frontend
      - run: docker build -t <app>-backend:ci ./backend
```

`npm ci` inside a CI runner installs from the lockfile in an isolated GitHub environment, so it is separate from the rule against installing locally. The CI for the sub-repositories is as follows.

- `frontend/.github/workflows/ci.yml`: `npm ci` → `npm run build` → `docker build`
- `backend/.github/workflows/ci.yml`: `npm ci` → `npm run build` → `npm test` (unit tests without a DB; integration tests are skipped) → `docker build`
- `infrastructure/.github/workflows/ci.yml`: `terraform init -backend=false && terraform validate`

## 8. Design system

All 8 apps use the same design system (project-standards #126, workout-memo #159). The old green-family tokens and the own sidebar of the earlier workout-memo are no longer used. For a new project, the central scaffold creates all of the following.

- **Tokens:** `@sirloinbh/design-tokens`. A black-and-white (shadcn/ui neutral) light and dark mode shared by the 8 apps, and the font Pretendard Variable. There is no per-app theme color; apps are distinguished only by display name (central ADR-0008).
- **Components:** shadcn/ui shared components (`frontend/src/components/ui/`, centrally managed). Icons are `lucide-react`, and emoji are Fluent Emoji Flat SVG (central ADR-0007).
- **Layout:** `AppShell` (top bar, left sidebar at 768px and up, left Sheet menu below that, footer), the screen mode menu, and a script that prevents a flash on the first screen.
- **PWA:** manifest, service worker, offline screen, icons.
- **Verification:** no horizontal overflow at 360, 390, 768 and 1280px, WCAG AA contrast in both light and dark, and menus and modals operable by keyboard.

The above is the default for a new project. workout-memo itself is dark-only through `features.darkOnly`, so it has no screen mode menu, and its screen checks are based on dark (#184, central ADR-0011).

For the detailed rules, follow the central repo's `docs/design-system.md`, `docs/ui-components.md`, `docs/layout.md` and `docs/pwa.md`, and this repo's [design system](design-system.md).

## 9. Git strategy

- **GitHub Flow:** keep `main` always deployable. Every change starts from an issue.
- **Order:** register a GitHub issue → a branch with the issue number → implementation, tests and the `docs/changes` record in the same commit → `npm run check` → PR → automatic code review (at most 2 times; fix commits, and large fixes go to a new issue) → check CI → **merge after CI passes**.
- **Issue:** write the purpose, scope, completion criteria (checkboxes), verification method and boundaries. Leave the rules that must be decided as "decisions before implementation", and when the user decides, record the confirmed rule as an issue comment. Make the body a UTF-8 file and register it with `gh issue create --body-file`.
- **Branch:** `<type>/<issue-number>-<slug>`. The type is `feat`, `fix`, `docs` or `chore` (for example `feat/12-workout-editor`). If the same issue already has a branch, keep using it.
- **Commit title:** `feat: <English summary> (#12)`. Write the reason in the body. For AI co-authoring, add a `Co-Authored-By:` line.
- **PR:** the base is `main`. Put the following in the body.
  - A summary, the main changes, the actual check commands with pass/fail/skip
  - The result of checking a screen change, and judgments and items that need confirmation
  - `Closes #N` (`Refs #N` for a partial implementation)

  If verification remains, keep it as a draft. If a PR for the same branch exists, update it instead of creating a new one.

- **Merge:** squash merge is recommended (the repository setting is up to the user). When several PRs edit the same file, merge `main` into the later PR to resolve conflicts, and confirm with tests that both features survive.
- **Parallel work:** use a separate `git worktree` for each issue. Avoid a shared stash, and split migration numbers and test DBs per issue.

## 10. AI instruction system

### 10.1 File roles

| File                                                       | Role                                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                | Instructions shared by all agents. Work procedure, project baselines (ports, time zone, units), verification commands, prohibitions, account rules |
| `CLAUDE.md` [Recommended]                                  | The file Claude Code reads automatically. Write briefly "this project follows `AGENTS.md`" + only the Claude-specific differences                  |
| `skills/<app>-implementation/SKILL.md`                     | The procedure: issue → branch → implementation and docs → tests → PR → automatic review (at most 2 times) → merge after CI passes                  |
| `skills/<app>-testing/SKILL.md`                            | Criteria for writing, running and recording tests                                                                                                  |
| `skills/<app>-foundation/SKILL.md` + `references/stack.md` | Development foundation, technology recommendations and the order to apply them                                                                     |
| `.claude/skills/`                                          | The copy of `skills/` for Claude Code. Edit only the source and update with `npm run skills:sync`; `npm run check` fails on a mismatch             |

- The one source of skills is `skills/` in the repository. Codex installs it into `skills/` in the Codex home, and Claude Code reads `.claude/skills/`.
- A skill file has YAML front matter (`name`, `description`). After a change, check it with skill-creator's `quick_validate.py` (`PYTHONUTF8=1` on Windows).
- Do not use repository-path-relative links in a skill body. This is so the links do not break when the copy location differs.

### 10.2 Items for `AGENTS.md` (template)

```markdown
# <App display name> Project Instructions

## Implementation work procedure

For requests for features, fixes, refactors, settings, docs and skill changes, follow skills/<app>-implementation/SKILL.md.

1. Register an issue in <owner>/<app> (reuse an existing issue the user named).
2. Create a `<type>/<issue-number>-<slug>` branch.
3. Write the implementation and the tests together, and include the docs/changes/<issue-number>-<slug>.md record in each commit.
4. Run `npm run check` before committing and before creating or updating a PR, and record the result in the docs and the PR.
5. **After a PR goes through automatic code review at most 2 times (large fixes go to a new issue), the agent merges the PR when the required CI passes.**
   Answering questions, recommendations and read-only investigation do not create an issue or a branch.

## Project baselines

- Technology: React + Vite + TypeScript, Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.
- Web port <web-port>, host DB port <db-port> (bound to 127.0.0.1). Do not change them without a user request.
- Date YYYY-MM-DD, time zone <timezone>. <Domain unit and NULL rules>.
- Do input validation and judgments on the server too. Use a transaction for multi-row changes.
- Do not commit or record .env, tokens, real backups or Terraform state.
- Do not overwrite user changes, and stage only the files you need.
- Install or remove npm packages only after the user reconfirms, with --ignore-scripts first.
- Sub-repository sync (scripts/push-repositories.ps1) and AWS deployment only on a separate request.

## Verification commands

- Everything: `npm run check`. DB integration: set `TEST_DATABASE_URL` for the dedicated DB and run `npm test` (skipped when not set = not verified).
- Infrastructure: `terraform validate`. For doc-only or skill-only changes: format, links and the skill validator.

## Docs

- docs/changes (per issue), docs/daily (summary of the working day), docs/next-steps (latest next work).
```

### 10.3 Account split (a PC that uses both a company and a personal account)

- Leave the default `gh` as it is and use the project-specific wrapper (`scripts/gh-project.ps1`). The wrapper clears the inherited `GH_TOKEN`/`GITHUB_TOKEN` and applies the token it got from `gh auth token --user <owner>` to that call only.
- For Git push, set the wrapper as this repository's **local** credential helper. Do not change the global helper.
- Before remote work, check that `<wrapper> api user --jq .login` is `<owner>`. Do not work around it with another account.
- Run the wrapper inside a git repository. It fails when run outside one.
- Choose the Codex personal profile with the `CODEX_HOME` environment variable. For the implementation details, see workout-memo's `docs/project-github-auth.md`.

### 10.4 [Optional] Local AI worker

workout-memo runs a worker with the central repo's runner (`tools/agents` in `sirloinbh/project-standards`): when a confirmed issue is put in the queue, it handles test → implementation → independent review → checks → PR automatically on the PC. A new project does not need it from the start. When you adopt it, keep the following in mind.

- Pin the model per role (for example the top model for planning, debugging and high-risk review, and the standard model for tests, implementation and review). Do not switch to another model on your own.
- The per-issue worktree, lock and state-transition tests are covered by `npm run test:agents` in the central repo. The app has only `.agents.json`.
- **Inside a sandbox, the Vite/esbuild build can fail because of a permission problem reading the parent folder.** Run the final `npm run check` on the host.
- Details: workout-memo's `docs/local-agent-workflow.md`.

## 11. Bootstrap checklist

Pass the "Check" at the end of each step before you go to the next step.

1. **Confirm values:** get the placeholders from chapter 0 from the user. Check: the table is completely filled in.
2. **Account and remote:** confirm the GitHub account to use and, if needed, prepare the wrapper from 10.3. Check: `api user --jq .login` = `<owner>`.
3. **Runtime:** pick Node 24.21.0 / npm 11.19.0 (with the user's own tool such as nvm or Volta; do not change the system Node on your own). Check: `node -v`, `npm -v`.
4. **Skeleton files:** create the 4.2 layout, the configuration files from chapter 5, `.env.example`, `compose.yaml`, the Dockerfiles, nginx.conf and `database/migrations/001_initial.sql` (minimal tables).
5. **Install dependencies (user confirmation required):** show the package list from 3.1, get approval by the procedure in rule 1 of chapter 1, and then install. Check: `package-lock.json` and each workspace lockfile exist.
6. **Minimum features:** create `createApp(pool)`, `GET /api/health`, one baseline screen, one unit test, one DB integration test and one UI test.
7. **Local verification:**
   - Start the DB with `docker compose up -d db`.
   - Create a dedicated test DB and apply every migration with `psql -f`.
   - Set `TEST_DATABASE_URL` and run `npm run check`.

   Check: exit 0 and the DB tests were not skipped.

8. **Run the containers:** create `.env` and run `docker compose up --build -d`. Check: the screen at `http://localhost:<web-port>` and the `/api/health` response are normal.
9. **AI instructions:** create `AGENTS.md`, `CLAUDE.md`, the 3 skills, and the `.claude/skills` sync script and its test from chapter 10. Check: `npm run check` includes `test:skills` and it passes.
10. **Docs:** create the README (run, verify, repository layout), `docs/development-baseline.md`, `docs/changes/`, `docs/daily/` and `docs/next-steps/`.
11. **Create the repositories:** after user approval, create the umbrella repository and 4 sub-repositories as private with `scripts/create-repositories.ps1 -Owner <owner>`. Check: CI passes in each repository.
12. **Infrastructure draft:** put the Terraform from chapter 12 in `infrastructure/` and run `terraform init -backend=false && terraform validate`. Run the real `apply` only when the user asks for a deployment.
13. **GitHub Flow from the first issue:** from then on, do every change by the procedure in chapter 9.

## 12. AWS infrastructure

### 12.1 [Currently applied] Shared Terraform draft (`infrastructure/`)

- Region `<region>` (default `ap-northeast-2`), shared by several apps through the `project` variable (default `shared-apps`).
- **ECR:** per-app frontend and backend repositories (`for_each`), immutable tags (IMMUTABLE), image scan on push, AES256 encryption, and a lifecycle policy that keeps only the latest 10.
- **AWS Budgets:** `<budget-usd>` USD per month, an email when actual spend exceeds 80%. A budget alert **does not stop spending.**
- Run: `terraform init` → `terraform plan -var='budget_email=…'` → `terraform apply …`. **Do not put the state file in Git** (it may contain sensitive data).
- To add another app, add its name to the ECR `for_each` list.

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}
provider "aws" { region = var.region }
```

### 12.2 Deployment alternatives (not connected yet; costs are estimated from the official Seoul region prices of 2026-10-15)

| Alternative                              | Setup                                                                   | Monthly cost estimate (before tax)                                                | Notes                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Shared server (several personal apps) | One Lightsail instance with Docker Compose + PostgreSQL, ECR, snapshots | 2 GB: about $13.50 / 4 GB: about $25.50 (whole server)                            | 0.5 to 1 GB leaves too little headroom. Separate DBs or schemas and permissions per app |
| 2. App server + managed DB               | EC2/Lightsail + RDS PostgreSQL                                          | The user's initial budget of KRW 30,000 to 60,000 or more (not a confirmed quote) | Less backup and maintenance burden                                                      |
| 3. Managed scaling                       | ECS Fargate + ECR + RDS + ALB                                           | High fixed cost                                                                   | When you need traffic and availability                                                  |
| Static frontend only                     | Amplify and the like                                                    | Calculate separately                                                              | You still need the API and DB separately                                                |

- **Do not expose an app with no login directly to the public internet.** Design a VPN, private access or authentication first.
- Things to prepare together when you deploy: HTTPS, remote state (S3 + locking), a GitHub OIDC deploy role (no long-lived keys), image version tags, health checks, CloudWatch log retention, backup and restore procedures, and a way to roll back to the previous image.
- Detailed cost calculation: the central repo's [`docs/costs.md`](https://github.com/sirloinbh/project-standards/blob/main/docs/costs.md) (including the per-app allocation basis).

## 13. Pitfalls confirmed in this project

| Symptom                                                                       | Cause                                                                                                                                                  | Response                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Korean text is stored as `?` in the DB and re-applying creates duplicate rows | The PowerShell 5.1 pipe sends ASCII                                                                                                                    | Run the mounted file with `psql -f`, or set `$OutputEncoding` to UTF-8, and write SQL with `U&` escapes                                                                     |
| Only the build of `npm run check` fails in an AI sandbox                      | Vite/esbuild cannot read the parent folder (the shared `node_modules`)                                                                                 | Run the final check on the host and record the result                                                                                                                       |
| The Prettier check suddenly fails                                             | Tool outputs such as `.bkit/` and `.playwright-mcp/`                                                                                                   | Add them to `.gitignore` and `.prettierignore`                                                                                                                              |
| Parallel PRs use the same migration number                                    | Each branch picks its own next number                                                                                                                  | Reserve the number when you start                                                                                                                                           |
| Several PRs keep conflicting in the same large file (`main.tsx`, `app.ts`)    | Screens and routes are gathered in one file                                                                                                            | Split into feature modules, and in the later PR merge `main` and confirm both features with tests                                                                           |
| Double-clicking a toggle button reverts the state                             | The two clicks are handled in different renders                                                                                                        | Ignore an opposite action within a short time + a regression test                                                                                                           |
| Data saved on another screen does not show up when you come back              | The screen does not reload on entry                                                                                                                    | Re-fetch on screen change                                                                                                                                                   |
| A server validation error shows up in the original English                    | Zod default message                                                                                                                                    | Give a Korean message for validation the user sees                                                                                                                          |
| After a backup "replace all", a retry answers a deleted id as "saved"         | The idempotent retry key is still there                                                                                                                | On a replace restore, clear the retry keys in the same transaction                                                                                                          |
| DB tests looked like "pass" but did not actually run                          | They are skipped when `TEST_DATABASE_URL` is not set                                                                                                   | Check the skip count and report what did not run separately                                                                                                                 |
| Only the backend sub-repository CI fails (`ENOENT … frontend/src`)            | A backend test reads `../../frontend`, which is not in the subtree                                                                                     | If the frontend source is missing, register that UI test as `test.skip`                                                                                                     |
| A PowerShell script stops on a single git or npm warning line                 | In PS 5.1 with `ErrorActionPreference='Stop'` plus output redirection, native stderr becomes an error. An empty string argument (`''`) also disappears | Judge native calls by `$LASTEXITCODE` and pass an empty value as `'""'`. PS 5.1 reads a `.ps1` containing Korean as ANSI, so read Korean strings from a separate UTF-8 file |

## 14. Source files to refer to (workout-memo)

When you copy a setting as it is, compare against the files below as the source.

- Instructions: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`, `skills/workout-foundation/SKILL.md`, `skills/workout-foundation/references/stack.md`
- Settings: `package.json`, `.npmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `frontend/tsconfig.json`, `backend/tsconfig*.json`, `frontend/vite.config.ts`
- Run: `compose.yaml`, `.env.example`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/Dockerfile`
- CI: `.github/workflows/ci.yml`, `frontend|backend|infrastructure/.github/workflows/ci.yml`
- Repositories: `scripts/create-repositories.ps1`, `scripts/push-repositories.ps1`, `scripts/backup.ps1`, `scripts/claude-skills.mjs`
- Infrastructure: `infrastructure/main.tf`, `infrastructure/versions.tf`, `infrastructure/README.md`
- Docs: `docs/development-baseline.md`, `docs/project-github-auth.md`, `docs/local-agent-workflow.md`, `docs/agent-issue-template.md`
