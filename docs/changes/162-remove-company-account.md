# #162 Remove the company account name from the documents

- Issue: [#162](https://github.com/sirloinbh/workout-memo/issues/162) (central sirloinbh/project-standards#237)

## Change

Removed the company GitHub account name from `AGENTS.project.md` and `docs/project-github-auth.md`. The rule "keep the default `gh` for the company account and use the personal account wrapper for remote changes to the project" is unchanged.

In the same work (#237), I rewrote the history by changing the company identity among the commit authors of this repo to a personal noreply address (2026-10-27, file contents unchanged).

## Verification

- Confirmed with `git grep` that no company account name is in the repository files
- Prettier passed
