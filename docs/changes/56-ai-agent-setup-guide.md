# #56 Setup document for the AI agent development environment of a new web app project

- Issue: [#56](https://github.com/sirloinbh/workout-memo/issues/56)
- Branch: `docs/56-ai-agent-setup-guide`

## Purpose

Pass the development environment run and verified in this project to the AI agent of a new web app project in one document, so it can start setting up right after receiving it.

## Change

- Added `docs/ai-agent-project-setup.md`. The structure is as follows.
  - Chapter 0: placeholders to confirm before starting (`<app>`, `<owner>`, ports, time zone, region, budget, domain rules).
  - Chapter 1: absolute rules for the agent (npm installs need user confirmation, only the user merges, secrets, explicit staging, telling apart checks that were not run, confirming vague requirements).
  - Chapter 2: language and document rules.
  - Chapter 3: tech stack. It separates the versions in use now from the recommended and not-yet-adopted candidates.
  - Chapter 4: the umbrella monorepo, the 4 subtree sub-repositories, and the directory layout.
  - Chapter 5: the contents of the real config files (`.npmrc`, `.editorconfig`, `.gitattributes`, the root `package.json`, Prettier, ESLint, tsconfig, Compose, Dockerfile, nginx, `.env.example`).
  - Chapter 6: API and storage safety (idempotency key and version) and migration rules.
  - Chapter 7: test kinds and the integrated CI.
  - Chapter 8: design tokens, components, responsive design, and accessibility.
  - Chapter 9: Git strategy.
  - Chapter 10: the AI instruction system (the AGENTS.md template, CLAUDE.md, skills and `.claude/skills` sync, account separation, the optional local worker).
  - Chapter 11: a 13-step bootstrap checklist.
  - Chapter 12: an AWS Terraform draft, and deployment alternatives and cost.
  - Chapter 13: 10 pitfalls found in this project.
  - Chapter 14: the list of source files to compare against.
- The setting values were copied from the real files on the current `main`. I compared the description of the sub-repository CI with `backend/.github/workflows/ci.yml` and reflected that backend runs up to `npm test`. Tools not yet adopted (React Router, TanStack Query, Tailwind/shadcn, Vitest, Playwright automated tests, Prisma, OpenAPI) are marked separately as `[추천·미도입]` (recommended, not adopted).
- For the design tokens, I picked the frequently used colors, radii, fonts, and breakpoints from `frontend/src/style.css`. For a new project, I recommended defining them as CSS variables (the current project writes colors directly, which made sharing hard).
- I added a link from the README to the new document.

## Checks

- This is a document-only change with no app behavior change, so I did not add app tests.
- I compared the setting blocks with the real files (`package.json`, `.npmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `eslint.config.mjs`, 3 tsconfig files, `vite.config.ts`, `compose.yaml`, `.env.example`, 2 Dockerfiles, `nginx.conf`, `.github/workflows/ci.yml`, 3 sub-repository CI files, and `infrastructure/*.tf`).
- The result is recorded below.
- I formatted the three documents with Prettier `--write` (table alignment). With a script, I confirmed that the internal anchor link in the document (`#11-부트스트랩-체크리스트`, the Korean heading anchor of chapter 11, bootstrap checklist) and the new link in the README are valid.
- `npm run check` on host Node 24.21.0 / npm 11.19.0 with a dedicated test DB: **exit 0**. App and DB 209 pass / 0 fail / 0 skip, workers 162 pass, skills 4 pass, and format, lint, type, and build pass.
- I did not verify by actually building a new project from scratch following the document (it needs a new repo and package installs, which need user confirmation).

## 2 more pitfalls — found while setting up 7 real projects (2026-10-19)

- While setting up 7 projects such as study-log with this document, I added the newly found pitfalls to chapter 13.
  - The sub-repository CI of backend fails because of a UI test that reads `../../frontend` (fixed in study-log #1).
  - Problems with native stderr, empty-string arguments, and Korean `.ps1` handling in PowerShell 5.1.
- This is a document change that only the format check applies to. `prettier --check` passes.
