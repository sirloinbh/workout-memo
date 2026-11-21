# Refresh backup screen visual baselines after #359 (#427)

#359 changed the text of the backup screen (what a backup stores), so the four `backup-*.png` baselines went stale and `e2e-visual` failed on main (ci run 44881690071). The four new baselines come from the `visual-baselines` artifact of that run (CI-pinned Playwright container). Only the backup shots at 360, 390, 768 and 1280 px changed (4 files); the new descriptive text is the only visible difference.

Why #359 merged with this red: PR #421 had `verify` and `docker-build` green (the only required checks), but `e2e-visual` was still pending and is not a required check. The agent merged on the required checks without waiting for the other visual job. From now on lane-1 waits for `e2e-visual` on frontend-touching PRs.
