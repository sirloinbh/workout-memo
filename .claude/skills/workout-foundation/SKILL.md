---
name: workout-foundation
description: Establish or improve the repeatable development foundation of the workout-memo app, covering stack, structure, conventions, API contracts, design, tests, Codex guidance, and deployment. Use for project foundation requests; apply only the requested scope through the workout-implementation issue-to-PR workflow.
---

# Workout Memo Development Foundation

Make the development, verification, and operation of the workout log app repeatable. First read `AGENTS.md` at the project root and `skills/workout-implementation/SKILL.md`, then work in this order: issue → numbered branch → implementation and docs record → tests and PR → automatic review (at most 2 rounds) → merge after CI passes. This skill does not skip the issue, PR, or CI steps and does not grant separate deployment permission.

## Scope and choices

- Read [Technology recommendations and order of adoption](references/stack.md) and apply only the areas the request needs.
- For package adoption, independent per-area builds, screen refactoring, stacked PRs, and generated artifacts, follow the [verified repeatable procedures](references/procedures.md).
- Check the current package.json, lockfiles, API and SQL, Compose, CI, and operations docs to tell what is actually implemented from what is only recommended. Do not install the whole recommendation list automatically or rebuild the app.
- There is one user (me), and login is not in the current requirements. Dates use the Asia/Seoul time zone, weights are total weight in kg including the base weight, and an unconfirmed base weight is NULL.
- Choose runtimes and dependency versions by checking official support and compatibility at the time of the work. Update the existing lockfiles and the installed environment together, and do not treat date-dependent recommendations as permanent fixed values.
- If a tool must be replaced, first write down the real problem, the effect on data, and how to verify it. Reuse the existing code and the user's choices.

## Steps

1. Decide the current state and the done criteria of the issue, and record the reasons for choices, the structure, and the contracts in the project docs that need them.
2. Align tool settings, the commands actually run, CI, and docs in the same change. Do not create unused settings, scripts, or empty modules.
3. For API and DB changes, preserve existing data and the meaning of dates and units, and verify how migrations are applied and how a failure is recovered. Pick a single source of truth for the DB schema and migrations.
4. For screen changes, keep the existing design while tidying shared components, forms, loading, empty results, errors, and keyboard access within the scope of that feature.
5. Apply the project's `skills/workout-testing/SKILL.md` as well. Write the implementation or fix together with the related test code, and add a regression test for a bug. Run the related checks before committing and before creating or updating a PR, and record the real results in the docs and the PR. Verify the changed behavior of the reference feature, workout log CRUD, with suitable unit, integration, and browser checks.
6. Do deployment work within the scope the user requested. Prepare image versions, health checks, config and secret management, backup and restore, and rollback to the previous version. Choose resources that cost money to match the purpose of the deployment and the budget.
7. Include a docs record in each work commit, open a verified PR, go through automatic review (at most 2 rounds), and merge once CI passes.

## Done criteria

Installing, running, and the relevant verification must be reproducible in a new environment by following the docs, and the chosen tools must show up in the real code, commands, and CI. Name tools that are not installed, checks that were skipped, and AWS deployments that were not actually done as follow-up work.
