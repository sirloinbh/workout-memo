# #73 First Lightsail deployment, IP allow list, $10 budget, backups, and rollback

- Issue: [#73](https://github.com/sirloinbh/workout-memo/issues/73) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 5)
- Branch: `feat/73-lightsail-deploy`. Stacked on #70 (PR #72). The server deployment uses `migrate` from #58.

## User decisions — 2026-10-20

1. The cheapest setup
2. An IP allow list
3. A monthly cost limit of $10
4. The backup and log retention values are the recommended values

The deployment account is the personal account (327230665171). The notification emails are the two addresses the user gave, and they go only into `terraform.tfvars`, which is excluded from git. The allowed IP is, for now, the public IP of the current PC alone.

## Choices and reasons

- **Lightsail `micro_3_0` ($7)**: in the Seoul region `get-bundles` query, the prices including IPv4 were nano $5 (0.5GB) / micro $7 (1GB) / small $12 (2GB). 0.5GB cannot handle PostgreSQL, the API, nginx, and the server build. EC2 (t4g.micro + a public IPv4 + EBS) costs more than $10 in the Seoul region.
- **ECR, S3, and CloudWatch Logs are excluded**: an IAM role cannot be attached to a Lightsail instance, so a long-term access key would have to sit on the server, and the cost also grows. Instead, the server builds the commit of the public repo and rolls back with commit-tagged images.
- **Recommended backup values**
  - A Lightsail automatic snapshot every day at 03:00: AWS keeps the latest 7.
  - A `pg_dump` every day at 03:30: kept on the server for 14 days, and also included in the snapshot.
  - A dump right before each deployment
  - Docker logs: rotated at 10MB×3 per container
- **Budgets alerts**: 50% and 80% of actual spend and 100% of forecasted spend of $10
- **No HTTPS**: there is no domain, so it runs on HTTP. The IP restriction blocks access, but the transport is not encrypted, so I wrote an SSH tunnel method in the document.

## Change

- `infrastructure/`
  - `versions.tf`: I set `profile = var.aws_profile` explicitly in the provider.
  - `variables.tf`: `allowed_cidrs` (1 or more, rejects `/0`), `expected_account_id` (12 digits), and the budget and backup defaults
  - `main.tf`
    - `terraform_data.account_guard`: if the account of the credentials differs from `expected_account_id`, the plan fails.
    - Resources: SSH key registration, the instance (Ubuntu 24.04, IPv4 only, automatic snapshots, `user_data` changes ignored), a static IP and its attachment, the firewall (22 and 80 only to the allowed CIDR), and a monthly budget (3 alerts)
    - I deleted the 2 shared ECR repos and the $20 budget of the earlier draft because this setup does not use them. They were never actually applied.
  - `outputs.tf`: the static IP, the URL, the SSH command, and the allowed CIDR
  - `user-data.sh`: the Seoul time zone, 2GB swap, `docker.io` and `docker-compose-v2` from the Ubuntu repo, log rotation, cloning the repo, generating the DB password on the server, web on `0.0.0.0:80`, and the backup script and cron
  - `terraform.tfvars.example`: an example of the personal values. The real file is covered by the `*.tfvars` ignore.
- `compose.yaml`
  - `image: workout-{backend,frontend}:${IMAGE_TAG:-local}`
  - Web `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8088}`, DB `127.0.0.1:${DB_PORT:-55432}`
  - The local default behavior is unchanged.
- `deploy/remote-deploy.sh`: `deploy <ref>` / `rollback` on the server
  - Order: build → a pre-deployment dump → `node dist/migrate.js` → start → health check
  - If the health check fails, it restarts with the previous image.
  - It keeps only the current and previous images.
- `scripts/deploy.ps1`: runs the server script over ssh. It includes waiting for the server initialization and checking the ref format.
- `docs/deployment.md` (new): the setup and cost, preparation (personal profile, SSH key, tfvars), applying, deploy and rollback, access, backup and restore, IP changes, alarms (CLI), and teardown
- CI `terraform` job: `fmt -check`, `init -backend=false`, `validate`, and `bash -n`
- Updated README, AGENTS.md, and `infrastructure/README.md`

## Verification (local)

| Check                                                                                                  | Result                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `terraform fmt -check`, `terraform validate`                                                           | Pass                                                                                           |
| `bash -n deploy/remote-deploy.sh`, and `user-data.sh` with the variables substituted                   | Pass (LF confirmed)                                                                            |
| Trying the server procedure in a separate Compose project (`IMAGE_TAG=deploytest`, web 8099, DB 55499) | `docker compose config` passes, and the image build and tags are confirmed                     |
| `node dist/migrate.js` inside the API image on an empty volume                                         | 9 baseline records, and "적용할 마이그레이션이 없습니다." (no migrations to apply) on a re-run |
| `/api/health` (through the web proxy)                                                                  | `{"status":"ok"}`                                                                              |
| Save 1 journal → `pg_dump \| gzip` → restore into a separate DB                                        | The restore succeeded, and the journal and 9 `schema_migrations` rows are confirmed            |
| Cleaning up the test stack                                                                             | `down -v`, and the test images deleted                                                         |

`npm run check`: **EXIT=0** (backend 279, frontend 89, workers 212, skills 4, all pass, with 0 fail and 0 skip).

## Real apply and server verification — 2026-10-20

The user set up the personal account profile `workout-personal`. I proceeded after confirming that the account is 327230665171 with `sts get-caller-identity`.

- I created the deployment-only SSH key `~/.ssh/workout-memo-lightsail` (confirmed an empty passphrase). I also confirmed that `terraform.tfvars` is excluded from git.
- `terraform plan`: 7 to create, 0 to change or delete. It passed the account guard. After the user's confirmation, `terraform apply` created all 7. The static IP is 3.38.114.136.
- **First deployment failures and fixes**
  - **user_data**: Lightsail prepends its own commands and runs user_data with `/bin/sh`. So it stopped at `set -o pipefail` (`Illegal option -o pipefail`). A local `bash -n` could not catch this problem. I changed it so an sh wrapper writes the bash script to a file and runs it with `bash`. I ran the same rendered result on the server with `sudo sh` and confirmed exit 0. The existing instance was not recreated, thanks to `ignore_changes`.
  - **deploy.ps1**: the known-hosts notice of ssh (stderr) became a terminating error under the `Stop` setting of PowerShell 5.1. I changed the ssh run section to judge only by the exit code. Even if cloud-init is left in the `error` state, it proceeds when the initialization output (`/usr/local/bin/workout-backup`) exists.
  - **remote-deploy.sh**: when there was no image to delete, the exit code 1 of `grep` was treated as a failure because of `pipefail`. The deployment itself had passed the health check and even recorded `.deployed`. I fixed it with `{ grep … || true; }`. I also hid the curl messages that appear during health retries.
- **Server verification**

| Check                                                           | Result                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Server initialization                                           | Docker 29.1.3, Compose 2.40.3, 2GB swap, `.env` with 600 permission, the backup cron, and the Asia/Seoul time zone |
| Firewall (`get-instance-port-states`)                           | Only 22 and 80 open to `1.215.143.251/32`, no IPv6 rule, `ipAddressType=ipv4`                                      |
| Automatic snapshot add-on                                       | Enabled, 18:00 UTC (Seoul 03:00)                                                                                   |
| First deployment `db2385dd8e29`                                 | After initializing the empty volume, 9 migration baseline records, health `{"status":"ok"}`                        |
| Access from the allowed IP (this PC)                            | `/api/health` 200, `/` 200, direct access to `/journal` 200                                                        |
| Playwright against the server (temporary config, not committed) | **2 passed**: journal CRUD and reload and back button. 0 journals after it finished                                |
| Manual backup `workout-backup`                                  | A dump was created, exit 0                                                                                         |
| Second deployment `7be918e12d36`                                | A pre-deployment dump created, migrations "nothing to apply", `.previous=db2385dd8e29`, only 2 images kept         |
| Manual rollback                                                 | Switched to `db2385dd8e29` without rebuilding, health ok, `.deployed` and `.previous` swapped                      |

## Not confirmed yet

- **Blocking from a non-allowed IP**: I did not try to connect from another network. The basis is that I confirmed through the API that the firewall rule opens only one allowed CIDR.
- **The automatic restore branch on a health failure**: I did not deploy a failing version. I did confirm the manual rollback that uses the same `start` function.
- **The actual creation of the daily 03:30 cron backup and the 03:00 automatic snapshot**: this can be confirmed only after the first run time passes.
- **The deployment target**: for now it is `feat/73-lightsail-deploy`, which includes all the unmerged PRs. After the PRs are merged, deploy again with `./scripts/deploy.ps1 -Server 3.38.114.136 -Ref origin/main`.
