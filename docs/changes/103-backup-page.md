# #103 Replace the backup and export screen with shared components (step 1)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-backup-page`

## Purpose

This is the first PR in moving #103 (replacing the body records, machine library, and backup screens) over one element at a time, one PR each, as in #101. Start with the smallest screen, backup and export. The remaining steps are the machine library list, the machine create and edit form and the official reference values, the body record trend and record form, the InBody import preview table, and the final `style.css` cleanup.

## Change — feat: replace the backup screen

- `frontend/src/backup.tsx`
  - The three sections (CSV for analysis, backup for restore, restore from backup) changed from `section.card` to `Card`, `CardHeader`, `CardTitle` (h3), `CardContent`, and `CardFooter`. Each description paragraph gets a utility (`text-body-sm text-muted-foreground`).
  - The two downloads changed from `a.primary` to `Button asChild` links with a `Download` icon. The address and the `download` attribute are unchanged.
  - The restore mode, backup file, and confirmation text use the shared `Label` (`htmlFor`) and `Input`. The restore mode keeps the browser's default `select`, as in the #101 set row, with a utility that looks like `Input`. The shared `Select` (Radix) picks values in a different way, so every `selectOptions` in the screen tests would need to change.
  - Progress and error text is the shared `Notice` (`role="status"` and `role="alert"` unchanged).
  - The restore preview shows a one-line-per-table list ("변경 요약", "change summary") and a conflict list ("충돌", "conflicts") in a bordered box. The table name is bold and the count is in muted text.
  - Confirmation step: when "전체 교체" ("replace all") is chosen, "복원 실행" ("run restore") becomes a `destructive` button. The behavior of turning on only when the confirmation text is entered exactly is unchanged. Added `autoComplete="off"` to the confirmation text field.
  - The page title `h2` keeps using the same legacy `h2` rule as the titles of exercise analysis and the Routine planner. Cleaning up the page header is in the scope of #222.
- `frontend/src/style.css`: removed `.backup-page .card`, `.backup-page a.primary`, `.backup-page label`, and `.backup-page li`. `.card`, `.primary`, and `.error` stay because other screens still use them.
- Screen difference: the spacing between cards and the inner padding become the shared `Card` values, and the description text grows from 12px to 14px. The download buttons get an icon, and the restore mode and the file picker are two cells in one row at 768px and wider.

## Tests

- Added: 2 tests in `frontend/src/backup.test.tsx`.
  - Check that the downloads are named links, that the three card titles are h3, that the "변경 요약" ("change summary") list in the preview has one line per table and the conflict list is separate, and that the preview heading is h4.
  - Restoring text (first follow-up): hold the restore response with `deferred` and check that only "복원하는 중…" ("restoring...") shows and that it disappears when it finishes.
- The existing 4 tests pass as they are because the label and button names are the same.
- `npm run test -w frontend -- src/backup.test.tsx`: 6 pass
- `npm run typecheck -w frontend`, eslint (changed files), prettier, `npm run test:docs`: pass
- The full local `npm run check` and e2e were not run because there is a history of running out of memory and three worktrees ran at the same time. e2e (responsive, axe, touch, visual baselines) was checked by the PR CI.

## Change — fix: first review follow-up (3668e6a)

- Description text size (required): `text-body-sm` was applied only to `CardContent`, so the text did not grow because of the legacy `p` rule (12px) that applies directly to `<p>`. It is now applied to each paragraph.
- Restore mode `select`: added `dark:bg-input/30`, `text-base md:text-body-sm`, and `disabled:cursor-not-allowed` to match the `Input` next to it.
- File input: changed the visible label from "백업 파일" ("backup file") to "백업 파일 선택" ("choose backup file") and removed the `aria-label` so the name comes from the label alone.
- Progress text: "백업을 확인하는 중…" ("checking the backup...") also showed while restoring (behavior from before the replacement). When a preview exists, it now shows "복원하는 중…" ("restoring...").
- The un-updated visual baselines (required) were updated in the test commit below after checking the CI images.

## Change — fix: touch 768px text size and second review (a5761d4)

- Second review: no code follow-ups, and the test count in this record differed from the actual count, so it was corrected. Two reviews are done, so there is no third review.
- In CI `e2e-visual` for `3668e6a`, `ui-touch` at 768px failed. The `md:text-body-sm` that was added to match the shared `Input` shrank 16px (the #104 standard, preventing iOS zoom) to 14px on touch devices at 768px and wider. As in the #101 set row, added `md:pointer-coarse:text-base` to the file input, the confirmation text, and the restore mode. The only other failures in the same run were the 4 `backup` visual baselines.

## Change — fix: card title size (c5a3205)

- The CI images for `a5761d4` showed the card title (the default size of the shared `h3`) larger than the page title `h2` (15px). As with the dashboard cards, gave `CardTitle` `text-body font-semibold`.

## Change — test: update visual baselines (787731d)

- In CI `e2e-visual` for `c5a3205`, only the 4 `backup` 360, 390, 768, 1280 images failed. 74, including axe, responsive, and touch, passed. The 360, 768, and 1280 images were viewed directly and showed no difference apart from the cards, the download button icon, and the two-cell input. After that the 4 images were updated with the `visual-baselines` artifact. The other images were byte-for-byte the same as the existing baselines.
- CI for `787731d` all passed.
- Limitation: the e2e fixed data has no step that picks a backup file, so the preview, the confirmation text, and the restore button do not appear in the images. They were checked only with the screen tests (`backup.test.tsx`).

## Merge main

- Just before the merge, main was ahead by #226 (#224 period selection row) and #227 (#102 My goals), so `origin/main` was merged. There were no conflicts. After the merge, `npm run test -w frontend -- src/backup.test.tsx` gave 6 pass and `npm run typecheck -w frontend` passed.
- At this point it was found that the record meant for the fix commits above never made it into the file because of the shell's `python` stub, so this record was rewritten.
