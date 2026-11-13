# #184 Apply dark-mode-only and make the screen checks use dark as the baseline

- Issue: [#184](https://github.com/sirloinbh/workout-memo/issues/184)
- Branch: `chore/standards-sync-7b8cf5d` (commits added to central sync PR #186)

## Purpose

The user decided to use only dark mode (#98). When the central option `features.darkOnly` (project-standards#354, PR #355) is received, every screen changes to dark, so the app-side checks and documents are aligned in the same PR.

## Change — chore: apply dark-only on the app side

- `frontend/index.html`: changed `theme-color` to the single value `#0a0a0a`.
- `e2e/layout.spec.ts`: added a test that checks that it shows dark even when the saved value is light, and that there is no screen mode menu.
- `e2e/__screenshots__/ui-visual.spec.ts/`: updated all 44 visual baselines with the `visual-baselines` of CI run 41180999742. This is because every screen changed to dark.
- `docs/design-system.md`: wrote dark-only and the reason, and fixed the layout table and rule 5.

## What was not fixed, and why

- `style.css`: I did not find a rule that breaks in dark, so I did not fix it. The shadow of the selected tab is almost invisible in dark, but it is not a problem.
- `e2e/a11y-known-contrast.json`: it is already empty, so there is nothing to delete.
- That the content of the backup and exercise analysis cards touches the border is seen as an existing padding problem, and I leave it to the screen replacement issues (#102, #103).

## Verification

- CI run 41180999742 (based on the sync commit): all 44 failures were visual regression, and 26 checks including accessibility and responsive passed. This axe check ran on the dark screens.
- I looked directly at 10 of the 44 new baselines: `dashboard-1280`, `workout-editor-390`, `analysis-1280`, `goals-390`, `body-768`, `routines-1280`, `machines-390`, `backup-1280`, `journal-360`, `goal-editor-1280`.
- I did not run the local `npm run check` and `npm run test:e2e`. The full check has been stopped by low memory on this PC before, and I also did not prepare a test DB. The result is confirmed with the PR CI.
- I did not check in a real browser at 1440×900. The widest baseline width is 1280px.

## Change — docs: first review fixes

- `docs/ai-agent-project-setup.md`: added the sentence that chapter 8 is the default for new projects and that workout-memo is dark-only.
- Split: the problem that the offline screen `frontend/public/offline.html` follows the OS light setting is a centrally managed file, so I split it into a central issue. The number is written in "Limits and follow-up" below.
- Comments not applied: the light branch in `sonner.tsx`, the comment in `theme.ts`, and the existence of the file `theme-toggle.tsx` are centrally managed files, and they do not cause a problem for the dark-only behavior.

## Change — docs: recover from the sync branch being recreated

- While I was working, central PR #362 (project-standards#359) was merged to main, and the sync bot recreated this branch as `3aecccf` (project-standards@c8a4331). The commits I had added earlier disappeared from the remote (project-standards#114).
- I recovered by cherry-picking the commits left locally onto the new head and pushing normally. I did not force push.
- The only differences before and after the recovery are the `std-git-writing` skill that #362 brought and `.standards/manifest.json`. The visual baselines were not regenerated.

## Change — docs: review record

- First review: applied as "First review fixes" above, and the offline screen was split into project-standards#363.
- Second review: nothing to fix. The reviewer could not compare before and after the recovery, so the author checked it with `git diff a432737 aee97c7`.

## Change — docs: recover from the second recreation of the sync branch

- Central PR #364 (project-standards#361) and #366 (project-standards#365) were merged to main, and the sync bot recreated this branch as `b78cfba` and `da1e2ec` (project-standards@6eda336). The commits I had added earlier disappeared from the remote (project-standards#114).
- I recovered by cherry-picking the 4 commits left in the local branch `chore/184-dark-only-restore` onto the new head and pushing normally. I did not force push.
- I checked the differences before and after the recovery with `git diff db06497 HEAD`. Apart from this record, they are only `.claude/settings.json`, `.codex/rules/git-branch.rules`, 2 places of the `std-git-writing` skill, and `.standards/manifest.json` that #364 brought. The visual baselines were not regenerated.

## Limits and follow-up

- Offline screen: project-standards#363. I proceed after this PR is merged.
- When a new merge enters central main, the sync branch is recreated and these commits disappear (project-standards#114). I do not merge to central main until this PR is merged.
