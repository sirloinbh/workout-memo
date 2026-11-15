# #21 chore: switch the repository to public and estimate monthly CI and AWS costs

- Issue: https://github.com/sirloinbh/workout-memo/issues/21
- Branch: feat/21-agent-task

## Changes and verification

The work agent records the actual changes and verification results.

## Test phase (2026-10-15, Asia/Seoul)

The goal was to run the pre-checks needed for the cost document on the shared server and DB for the 8 apps, and to confirm which items were still unmet before implementation. I read AGENTS.md, workout-implementation, and workout-testing. I reused the existing issue and branch, and the test role changed only this work record. I did not add or change app tests, tools, skills, or implementation files.

### Actual commands and results

- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short --branch`: the current branch is `feat/21-agent-task`, and only the existing untracked work record was found. There was a warning about read permission on the user's Git ignore settings, but the working tree status query succeeded. I did not change the global Git settings.
- The following deliverable check failed with exit code 1, as expected. The cost document does not exist and there is no relative link in the README. This is an unmet requirement before implementation, not an execution environment block.

```powershell
node -e "const fs=require('fs');const p='docs/shared-hosting-costs.md';const exists=fs.existsSync(p);const link=fs.readFileSync('README.md','utf8').includes('](docs/shared-hosting-costs.md)');console.log('cost document exists: '+exists);console.log('README relative link exists: '+link);process.exitCode=exists&&link?0:1;"
```

- The following calculation check passed with exit code 0. It confirmed ECR $0.50, snapshot $1.00, monthly pre-tax $13.50/$25.50, pre-tax 18,900 KRW/35,700 KRW at the illustrative exchange rate, and after-tax 20,790 KRW/39,270 KRW under the VAT assumption.

```powershell
node -e "const assert=require('node:assert/strict');const ecr=5*0.10,snapshot=20*0.05;assert.equal(ecr,0.50);assert.equal(snapshot,1);for(const [server,usd,krw,vat] of [[12,13.5,18900,20790],[24,25.5,35700,39270]]) {assert.equal(server+ecr+snapshot,usd);assert.equal(usd*1400,krw);assert.equal(Math.round(krw*1.1),vat);}console.log('PASS: ECR, snapshot, USD totals, illustrative KRW and VAT totals (2 GB / 4 GB)');"
```

- `npm run check`: exit code 0. Prettier, ESLint, frontend and backend type checks, 3 backend unit tests, 34 agent tests, and frontend and backend builds passed. 1 PostgreSQL integration test was skipped, so DB verification is not complete. I did not add a dedicated DB setup. This is the baseline result before implementation and does not replace the final document verification.
- The web tool `open` reached the 4 official sources below. I confirmed the Lightsail IPv4 Linux base prices of $5/$7/$12/$24, the snapshot price of $0.05/GB-month, and the $0.10/GB-month in the ECR pricing example. I did not research firm quotes for each RDS configuration or live exchange rates.
  - [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)
  - [ECR pricing](https://aws.amazon.com/ecr/pricing/)
  - [RDS PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
  - [Amplify pricing](https://aws.amazon.com/amplify/pricing/)
- `npx --no-install prettier --check docs/changes/21-agent-task.md README.md`: exit code 0, both files pass formatting.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 diff --check`: exit code 0. There is currently no diff in tracked files, and the untracked work record is outside the scope of this command. I checked the work record with the Prettier check above.

### Completion criteria to check after implementation, and limits

- The implementation targets are `docs/shared-hosting-costs.md`, the relative link in the README verification and operations section, and this record. Review the new document's Korean title and description, the check date 2026-10-15, the assumptions on the Seoul region, always-on operation, traffic, and storage, and the formulas in the tables.
- Preserve the three alternatives (a cheap shared server, a separate managed DB, and a static frontend) and the user's budget range, and keep price and performance assumptions distinct. Also check per-app DB/schema and permission separation, observation of resources and connection counts, external backup and restore, and the localhost:8088 and private access assumptions.
- Confirm that the figures are the cost of the whole server, not a per-app cost. Check the exchange rate and VAT assumptions, the excluded cost items, the limits of the $20 budget alert, and the explanation that stopping an instance alone does not remove all fixed costs.
- Separate the current Terraform scope from future operating alternatives, and review that the document does not present an actual deployment, load test, account billing lookup, or consistent DB recovery as done.
- After implementation, I must confirm that the internal links point to real targets, and run Prettier and `git diff --check` on the new document, the README, and the work record. The new cost document does not exist yet, so the final deliverable review is incomplete.
- This is a documentation-only scope, so I did not add app tests. No skill was changed, so `quick_validate.py` does not apply. I did not access secret files, real backups, or Terraform state, and I did not perform a deployment, a load test, or an actual billing lookup.

## Implementation phase (2026-10-15, Asia/Seoul)

The goal was to keep the shared hosting alternatives and the conditional monthly budget from the earlier #21 follow-up request in a Korean-language document. I applied workout-implementation and workout-testing and reused the existing issue and branch. The earlier reviewer's findings were not in the phase results passed to me.

### Changed files

- `docs/shared-hosting-costs.md`: summarized the shared server, separate managed DB, and static frontend alternatives and the user's proposed budget. It states the check date, the official sources, the Seoul region, storage, exchange rate, and VAT assumptions, the formulas, the excluded costs, the resource, backup, and access plans, and the current Terraform scope.
- `README.md`: added a relative link to the cost document in the verification and operations section.
- `docs/changes/21-agent-task.md`: kept the pre-phase record and added the actual implementation and verification results.

### Actual verification commands and results

- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short --branch`: exit code 0, confirmed the existing `feat/21-agent-task`. There was a warning about read permission on the personal Git ignore file, but the query succeeded and I did not change the settings.
- Web tool `open`: reached the same 4 official sources as in the test phase. I rechecked the Lightsail base pricing and the ECR, RDS, and Amplify pricing pages. I did not settle a detailed RDS quote or a live exchange rate.
- `npx --no-install prettier --write docs/shared-hosting-costs.md README.md`: exit code 0, reformatted the tables in the new document, and README was unchanged.
- A deliverable check with `node -e` using Node `fs`, `path`, and `assert`: it checked that the document exists, the README relative link exists, there is no UTF-8 replacement character, and the internal link targets really exist. The first run exited with code 1 because it mistook a link string in a code example in the work record for a real Markdown link. After I changed the one-off check to exclude code blocks, it passed with exit code 0. I did not weaken or delete the document or any existing test assertions.
- The calculation check with the same `node -e`: confirmed that `5 * 0.10 = 0.50`, `20 * 0.05 = 1.00`, the server price totals of $13.50/$25.50, and the results of `USD * 1400` and `Math.round(KRW * 1.1)` match the amounts in the document tables. Exit code 0.
- Manual review of the Korean requirements: confirmed that the document covers whole-server cost rather than per-app pricing, conditional performance and price, per-app DB/schema and permission separation, the external backup and restore plan, `localhost:8088`, the excluded costs, and the limits of the budget alert.
- `npx --no-install prettier --check docs/shared-hosting-costs.md README.md docs/changes/21-agent-task.md`: exit code 0, all three files pass formatting.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 diff --check`: exit code 0. The 2 untracked documents are outside the scope of the Git diff, so I checked them with the Prettier and deliverable checks above.
- Final `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short`: exit code 0, confirmed only the README modification and the 2 designated untracked documents.

### Limits and follow-up roles

I did not change app code, Compose, Terraform, skills, or tests. This is a documentation-only change, so I did not add app tests and did not repeat the final full app check. The host `npm run check` result with exit code 0 from the pre-phase is preserved above, and the skip of 1 DB integration test does not mean DB verification succeeded. No skill was changed, so `quick_validate.py` does not apply.

I did not perform an actual deployment, a load test, an account billing lookup, or a DB restore verification. I did not access secret files, real backups, or Terraform state. The implementation changes are handed to an independent review in an uncommitted state; the coordinator handles the commit, push, and PR, and the user handles the merge.
