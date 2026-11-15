# Technology recommendations and adoption criteria

This document keeps the development foundation recommendations the user reviewed. The tools below are recommended candidates, not a list of what is installed or a ranking by usage. Existing user choices and the scope of the issue come first. Check the current implementation in the project's package.json, Compose, and CI.

## Nine readiness areas

| Area                         | Recommendation                                                            | Adoption criteria                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tech and structure           | React + Vite + TypeScript, Express, PostgreSQL, npm workspaces            | Develop in an umbrella monorepo and sync the 4 per-area repositories with subtrees.                                                                                       |
| Git                          | GitHub Flow, issue-number branches, PRs, squash merge                     | After tests, open a PR; when automatic review (at most 2 rounds) and CI pass, the agent merges with a merge commit. Do not change repository settings automatically.      |
| Code rules                   | ESLint, typescript-eslint, Prettier, EditorConfig                         | Split the roles of error checks, type rules, formatting, and editor settings. Prepare the real commands and CI together.                                                  |
| API contract                 | REST, OpenAPI, Zod                                                        | Define requests, responses, errors, and units, and keep server-side input validation. Create a shared contract package only when it really removes duplication.           |
| Design                       | Tailwind CSS, shadcn/ui, Lucide                                           | Start by making the existing design's tokens and the needed buttons, inputs, modals, and states shared.                                                                   |
| Development and verification | Docker Compose, Vitest, React Testing Library, Playwright, GitHub Actions | Keep the existing DB integration tests and adopt the rest step by step to fit the purpose of each test. Do not replace the existing node:test wholesale without a reason. |
| Codex guidance               | AGENTS.md, docs, per-task skills                                          | Separate the core instructions, the detailed design, and the repeatable procedures, and refer to the source documents.                                                    |
| Deployment and operations    | AWS, Terraform, ECR, CloudWatch, S3, AWS Budgets                          | Prepare images, infrastructure, logs, backups, and cost alerts. Apply them in a task where the real deployment scope and budget are decided.                              |
| Reference feature            | Workout log CRUD                                                          | Verify by observing the related behavior, from date and period queries and create, edit, and delete to goal evaluation.                                                   |

## Frontend candidates

- React Router: URLs and navigation for the dashboard, log, goals, and machine screens.
- TanStack Query: server queries, caching, errors, and list refresh after a save.
- React Hook Form + Zod: the set array, input validation, and per-field errors.
- Tailwind CSS + shadcn/ui: shared UI and design tokens. Adopt within the needed scope while preserving the current CSS.
- Recharts: adopt when a volume or weight trend chart is required.

## DB access and contracts

The current setup uses pg + SQL. The migration history was introduced in #58 with `schema_migrations` and `npm run db:migrate`. Per-feature route modules (`backend/src/routes/`) and the REST contract doc (`docs/api.md`) were tidied in the same work. OpenAPI generation and a shared Zod contract package are introduced in a separate issue when removing real duplication needs them. #60 introduced Vitest, React Testing Library, and Playwright, moved screen tests to a real DOM, and connected the workout log CRUD browser check to CI. #62 introduced React Router (page URLs) and TanStack Query (dashboard, log, goal, and machine queries). #64 introduced the shared Zod contract (`shared/contract.ts` as the source, copied to backend and frontend), React Hook Form (goal form), and per-field validation before saving the log and machine forms. #66 introduced design tokens (`theme.css`), Tailwind CSS 4 (without Preflight), and shadcn/ui-style shared components (`components/ui`), and confirmed the screens before and after the change are identical pixel by pixel. #159 switched to the design system shared by the 8 apps (black-and-white light and dark tokens, Pretendard, shadcn/ui shared components, `AppShell`, PWA install). Prisma is a candidate to consider when an ORM switch is requested. When switching, verify the existing DB baseline and data preservation, and do not run different migration sources in database and backend at the same time.

Dates use `YYYY-MM-DD` and the service time zone is `Asia/Seoul`. Enter a machine's base weight only when it is confirmed. A workout weight is the total weight in kg including the base weight, and the server decides whether a goal is met by whether one set of the same exercise in the period met both the target weight and the target reps.

## AWS deployment candidates

- Personal first deployment: EC2 + Docker Compose + PostgreSQL, with a separate backup to S3. You operate the server, the DB, and backup recovery yourself.
- Managed expansion: ECS Fargate + ECR + RDS PostgreSQL + ALB. Fixed costs and the scope of the setup grow, so choose it to match the purpose.
- For an app without login, design a path only I can reach at the same time. Separate a setup used on localhost from an operating setup reachable from outside.
- A cost alert is not a feature that blocks spending. Record the log retention period, image retention, backup retention, and the recovery procedure in the operations docs.

## Recommended order of adoption

Progress is by PR creation; check on GitHub whether each was merged.

1. Fix Node.js LTS, npm, lockfiles, and the code format, static check, and integration check commands. The earlier recommendation was Node.js 24 LTS; recheck the support status and package compatibility when really adopting it. — #4 done.
2. Tidy the per-feature structure, the shared contract, and the API and DB migration docs. — #58 (migration history, route modules, REST docs), #64 (shared Zod contract), #68 (OpenAPI).
3. Adopt shared UI, routing, and server data and form state management. — #62 (React Router, TanStack Query), #64 (React Hook Form), #66 (tokens, Tailwind, shared components).
4. Browser verification of the log CRUD and connecting it to PR CI. — #60 (Vitest, RTL, Playwright, CI e2e).
5. First deployment, health checks, logs, backup and restore, and rollback to the previous image. — Waiting: the user must decide the operating environment, the access method, and the budget.
6. Reflect the confirmed repeatable procedures in the instructions and skills. — #70 ([verified repeatable procedures](procedures.md)).

## Official references

- [Developer tools usage survey](https://survey.stackoverflow.co/2025/technology)
- [Node.js release schedule](https://github.com/nodejs/Release)
- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [OpenAPI](https://spec.openapis.org/oas/latest.html)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [React Hook Form and Zod example](https://ui.shadcn.com/docs/forms/react-hook-form)
- [Prisma](https://www.prisma.io/docs/orm/core-concepts)
- [Playwright](https://playwright.dev/docs/intro)
- [ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
- [RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Skills](https://learn.chatgpt.com/docs/build-skills)
