# #151 Delete the old auto-deploy systemd files

- Issue: [#151](https://github.com/sirloinbh/workout-memo/issues/151)
- Branch: `chore/151-remove-old-autodeploy-units`

## Change

- Deleted `deploy/workout-autodeploy.service` and `deploy/workout-autodeploy.timer`.
  - The centrally managed files `deploy/autodeploy.service` and `deploy/autodeploy.timer`, which came in with the first sync (#143), replace them.
  - `deploy/install-autodeploy.sh` installs the new files with the same unit name (`workout-autodeploy`).
- The units installed on the server (`/etc/systemd/system/workout-autodeploy.*`) are files copied at install time, so this change does not change them. The `systemctl` and `journalctl` commands in `docs/deployment.md` stay the same because the unit name is the same.

## Checks

- `git grep "deploy/workout-autodeploy"`: no references left
- No references to the old file names in the central registry and templates either
- The full check is confirmed with CI.
