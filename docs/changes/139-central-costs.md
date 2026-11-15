# #139 Point the cost document links to the central docs/costs.md

- Issue: [#139](https://github.com/sirloinbh/workout-memo/issues/139)
- Branch: `feat/139-central-costs`
- Depends on: project-standards#41 (cost document moved to the central repo, merged)

## Purpose

The server cost document shared by the 8 apps was in `docs/shared-hosting-costs.md` of this repo. The updated content (ECR excluded, domain cost and per-app allocation added) was moved to the central repo [`docs/costs.md`](https://github.com/sirloinbh/project-standards/blob/main/docs/costs.md), and if the same document exists in two places, only one of them may be fixed when an amount changes.

## Change — docs: link to the central cost document

- `README.md`: changed the link of the shared hosting cost document to the central `docs/costs.md`.
- `docs/ai-agent-project-setup.md`: changed the "detailed cost calculation" link to the central document, and removed `docs/shared-hosting-costs.md` from the document list of this repo.
- `docs/shared-hosting-costs.md`: deleted. The content is in the central document, and the old content stays in the Git history.
- The past records in `docs/changes/` show the state at that time, so they were not changed.
- The deployment cost of this app in `docs/deployment.md` (about $7 to $8) is based on this app's server, so it was left as it is.

## Review

- First: no required comments. I confirmed that the "current Terraform scope" that was only in the deleted document is outdated after the infrastructure was removed in #141, and that the `localhost:8101` binding is in the central document as "assumes an SSH tunnel or private access", so there is nothing to move. Applied: I corrected the "same content" wording above and the sentence in the tests.

## Tests

- `git grep shared-hosting-costs`: results appear only inside `docs/changes/` (the records of #21, #136, #139, and #141).
- I checked with the GitHub API that the central `docs/costs.md` exists.
- prettier (changed files), `npm run test:docs`: passed
