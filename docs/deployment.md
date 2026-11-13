# Deployment and operations (Lightsail)

The app runs on one Lightsail server in a personal account, with Docker Compose (web, API, PostgreSQL) (#73). It can be reached only from allowed IPs.

## 1. Infrastructure (shared-aws-infrastructure)

The server, the static IP, the firewall, the SSH key, and the budget alert are managed by Terraform in the shared repo `sirloinbh/shared-aws-infrastructure`. The procedures below follow `docs/operations.md` in that repo.

- The setup and the monthly cost (about $7 to $8, VAT excluded)
- One-time preparation: the AWS profile (an IAM user only for Terraform), the SSH key, and `terraform.tfvars`
- Applying the infrastructure (`terraform plan` and `apply`), and backing up the state and recovering when it is lost
- Adding the SSH key of a new PC to the server
- Changing the allowed IP, alarms, and teardown

This repo has only the deploy scripts that run inside the server (`deploy/`) and `scripts/deploy.ps1`, which runs on the PC. Get the server address (`<static_ip>`) with `terraform output static_ip` in the infrastructure repo.

## 2. App deploy and rollback

```powershell
./scripts/deploy.ps1 -Server <static_ip> -Ref origin/main   # deploy
./scripts/deploy.ps1 -Server <static_ip> -Rollback          # go back to the previous deploy
```

The deploy order (`deploy/remote-deploy.sh`):

1. Wait until the server initialization finishes (`cloud-init status --wait`).
2. Fetch and check out the ref, and build the image with the commit tag (12 characters).
3. If there is a previous deploy, make a DB dump first.
4. Start the DB and apply the migrations with `node dist/migrate.js` inside the API image (recorded in `schema_migrations`). On the first deploy, Docker initialization creates the empty volume, and this step records the baseline.
5. Start everything and check `http://127.0.0.1/api/health` for up to 60 seconds.
6. If health fails, restart with the image of the previous commit and end as a failure.
7. On success, record `.deployed` and `.previous`, and keep only the current and previous images.

- A rollback does not build again and starts right away from the previous image.
- Migrations are not undone. If the previous app does not work on the new schema or the data must be rolled back, restore from the dump taken just before the deploy (see 4 below).
- Local behavior does not change. `compose.yaml` uses the variables `IMAGE_TAG`, `WEB_BIND`, `WEB_PORT`, and `DB_PORT`, and the local defaults are the central registry ports (image `local`, web `127.0.0.1:8101`, DB `127.0.0.1:15401`). Only the server `.env` opens the web on `0.0.0.0:80`.

## 2-1. Automatic deploy of main (#75)

When something is merged to main, the server checks it itself and deploys (a pull method). The server firewall is not opened to GitHub, and no AWS or SSH key is stored in GitHub.

- `workout-autodeploy.timer` runs `deploy/autodeploy.sh` every 2 minutes (starting 3 minutes after boot).
  1. It fetches `origin/main`. If that commit was already deployed, it ends.
  2. It queries the GitHub Actions check-runs of that commit through the public API (60 times per hour without authentication, called only while waiting).
     - If they are running or have no result yet, it checks again in the next round.
     - If even one failed or was canceled, that commit is not deployed.
     - If all succeeded (or were skipped or neutral), go to step 3.
  3. It runs `deploy/remote-deploy.sh deploy` of the new commit. The order is the same as a manual deploy (pre-deploy dump → migrations → health → previous image on failure).
  4. A failed commit is recorded in `.autodeploy-failed` and is not tried again. When the next commit comes, it starts again.
- A manual deploy or rollback and the automatic deploy use the same lock (`/run/lock/workout-deploy.lock`), so they do not run at the same time.
- A manual rollback records the current main commit as a commit to skip. So the automatic deploy does not put that commit back right away and deploys again from the next main commit.
- The time from merge to deploy is about the sum of CI (about 2 to 3 minutes), the check interval (2 minutes at most), and the server build (several minutes).
- Status check and control (on the server):
  ```bash
  systemctl list-timers workout-autodeploy.timer          # next run time
  journalctl -u workout-autodeploy -n 50 --no-pager       # recent log
  cat /opt/workout-memo/.deployed                          # the commit being deployed
  sudo systemctl stop workout-autodeploy.timer             # pause
  sudo systemctl start workout-autodeploy.timer            # resume
  rm /opt/workout-memo/.autodeploy-failed                  # retry a skipped commit
  ```
- On a new server, user-data installs the timer. On an existing server, install it with `sudo bash /opt/workout-memo/deploy/install-autodeploy.sh`.

### Cost of deploying many times

The number of deploys by itself adds no charge. The reasons are as follows.

| Item                | Effect of repeated deploys                                                                                                                                                                                                                                         | Charge                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Lightsail instance  | A flat $7 per month. Even if the build uses a lot of CPU, the charge is the same, and it only gets slower if the burst limit is exceeded                                                                                                                           | None                                         |
| Data transfer       | The images, npm packages, and git received during a build are inbound traffic. They count toward the 2TB allowance, but the overage charge applies only to outbound                                                                                                | None (from $0.09/GB only above 2TB outbound) |
| Snapshots           | Fixed at once a day, regardless of the number of deploys. But if the disk changes a lot, the incremental size grows and the $0.05/GB-month can rise a little. So each deploy keeps only the current and previous images and deletes build caches older than 7 days | Negligible                                   |
| Pre-deploy DB dump  | Kept 14 days on the server disk. A few KB to MB                                                                                                                                                                                                                    | None                                         |
| GitHub Actions      | The repo is public, so the standard runners are free                                                                                                                                                                                                               | None                                         |
| GitHub API queries  | Public API, no authentication                                                                                                                                                                                                                                      | None                                         |
| ECR, S3, CloudWatch | Not used                                                                                                                                                                                                                                                           | None                                         |

[Lightsail pricing](https://aws.amazon.com/lightsail/pricing/), [Lightsail data transfer](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html). An unexpected cost shows up in the $10 monthly budget alert (50%, 80%, forecast 100%).

## 3. Access

- **Browser**: `http://<static_ip>`. It opens only from allowed IPs.
- **SSH**: `ssh -i ~/.ssh/workout-memo-lightsail ubuntu@<static_ip>`
- **SSH tunnel** (encrypted transport): run `ssh -i ~/.ssh/workout-memo-lightsail -L 8101:127.0.0.1:80 ubuntu@<static_ip>` and then open `http://localhost:8101`.
- **Logs**: on the server, `cd /opt/workout-memo && docker compose logs --tail 100 api`

## 4. Backup and restore

- **Automatic**
  - A Lightsail snapshot every day at 03:00: the whole server, and it can be restored to a new instance from the console.
  - A DB dump every day at 03:30: `/var/backups/workout/workout-<date>.sql.gz`, and the run log is `/var/log/workout-backup.log`.
- **Manual dump**: `/usr/local/bin/workout-backup`
- **Bring it to the PC**: `scp -i ~/.ssh/workout-memo-lightsail ubuntu@<ip>:/var/backups/workout/<file> ./backups/`. `backups/` is excluded from git.
- **Check a restore** (on the server, into a separate DB): restore with the commands below, then check the `workouts` and `schema_migrations` rows. Locally, the same commands were verified as dump → restore → check of the log and 9 history rows.
  ```bash
  cd /opt/workout-memo
  docker compose exec -T db createdb -U workout workout_restore
  gunzip -c /var/backups/workout/<file> | docker compose exec -T db psql -q -U workout -d workout_restore -v ON_ERROR_STOP=1
  ```
- **Replace the production DB with a dump**: stop the app (`docker compose stop api web`), recreate `workout` and restore with the method above, and then start again. It cannot be undone, so make a dump right before it first.
- Also use the app screen's "Backup and export" JSON backup for keeping on the PC.
