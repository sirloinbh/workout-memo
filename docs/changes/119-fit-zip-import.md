# #119 Activity file import (2): FIT and ZIP, batched saving

- Issue: [#119](https://github.com/sirloinbh/workout-memo/issues/119) (decisions in the 2026-11-08 and 2026-11-16 issue comments)
- Branch: `feat/119-fit-zip-import`
- Preceded by: PR (1) TCX and GPX, preview and duplicate prevention ([`119-activity-import.md`](119-activity-import.md), merged in #266)
- Research and decisions: [`docs/activity-import.md`](../activity-import.md) sections 10 and 11

## Purpose

Read Garmin FIT files and ZIP archives (one activity's "Export Original", or a whole-account export) in the same import card, and save any number of chosen rows.

## User decisions (2026-11-16)

1. Packages: `@garmin/fitsdk` 21.218.0 and `fflate` 0.8.3, installed by the user with `npm install --ignore-scripts --save-exact -w frontend`. 21.218.0 is the newest FIT SDK version at least 14 days old (21.221.0 was 13 days old).
2. FIT is read in the browser with the SDK. The SDK is under the Garmin FIT Protocol License, which calls it confidential and forbids making it available to third parties (section 2c). Reading in the browser serves it with the public site, and the user accepted that.
3. The user provides 1–2 real Garmin FIT exports for the tests. GPS and personal data are removed before anything is committed.
4. More than 200 chosen rows are saved in batches of 200, oldest first. Each batch is all or nothing. A refused batch stops the save, and the batches before it stay saved.

## Package check

| Package          | Version  | Published  | Dependencies | Install scripts | Size                                        | License                                 |
| ---------------- | -------- | ---------- | ------------ | --------------- | ------------------------------------------- | --------------------------------------- |
| `@garmin/fitsdk` | 21.218.0 | 2026-10-06 | none         | none            | 1.45 MB unpacked; 433 kB chunk (63 kB gzip) | Garmin FIT Protocol License (see above) |
| `fflate`         | 0.8.3    | 2026-05-16 | none         | none            | 32 kB chunk (12 kB gzip)                    | MIT                                     |

- Read the shipped files of both tarballs: no `fetch`, `XMLHttpRequest`, `child_process`, `eval`, `new Function`, `process.env` or known exfiltration hosts.
- After the install: the root lockfile gained only these two packages, with the integrity hashes checked before installing. The lockfile's packages with install scripts (esbuild, fsevents, tesseract.js) were all there before.
- `frontend/package-lock.json` (the subtree's own lockfile for its Docker build) was regenerated in a temporary directory by the user with `npm install --package-lock-only --ignore-scripts --before=2026-11-02`. It differs from the old one only by the two packages.
- `docker build --secret id=npm_token,env=NODE_AUTH_TOKEN ./frontend` passed with the new lockfile.
- While restoring the lockfile after an `npm run` command, the root lockfile lines of the install were undone by mistake. They were put back from the regenerated frontend lockfile and give the same 14-line diff; `npm ls @garmin/fitsdk fflate` resolves both.

## Change - feat: read FIT and ZIP

- `frontend/src/cardio/activity-file.ts`:
  - `parseFit`: loads the SDK with a dynamic `import()` (its own chunk), checks the FIT signature and CRC, and turns each session message into one activity. A multisport file gives one row per sport, without transitions.
    - Duration is `total_timer_time` (pauses excluded), the 2026-11-08 decision; distance `total_distance`; average and maximum heart rate; calories.
    - Elevation gain is `total_ascent`. Unlike TCX and GPX, FIT has a reliable total, so it is kept.
    - Cadence is kept only for cycling (rpm). Running cadence is stored per foot, as with TCX.
    - Kinds: running, walking and hiking, cycling (indoor for `indoorCycling`, `spin` and `virtualActivity`), swimming, rowing, and the fitness equipment sub sports (treadmill → Running, indoor rowing → Rowing, elliptical, stair climbing → Stairs, indoor cycling, indoor walking). Anything else is Other.
    - The external ID is the start instant, as for TCX and GPX, so a FIT and a TCX of the same activity share it ("Same activity as row N" / "Already imported").
    - Out-of-range values are left empty, as for TCX and GPX.
    - Errors by file name: not a FIT file, damaged (CRC or decoding failure), and a FIT file without an activity summary (for example a settings file).
  - `readActivityFile(name, bytes)`: one chosen file → `{ activities, problems }`. ZIP (by extension or the `PK` signature) is opened with `fflate`, also loaded on demand. Activity files inside are read the same way and named `archive.zip › file.fit`. One nested ZIP level is opened, as in Garmin's whole-account export. Other entries (JSON, images, `__MACOSX`, dot files) are skipped. A damaged ZIP and a ZIP without activity files are reported. FIT is also told by its `.FIT` signature when the name has no extension. A bad file inside a ZIP does not stop the others.
  - The file chooser accepts `.tcx,.gpx,.fit,.zip`, and the unknown-format message names all four.
- `frontend/src/cardio/cardio-import.tsx`:
  - Files are read as bytes through `readActivityFile`. While they are read, the status says "Reading files…".
  - The hint and the label name FIT and ZIP: "Activity file (TCX/GPX/FIT/ZIP)".
  - Saving: the 200-row limit no longer disables Save. More than 200 chosen rows show a note and are sent in batches of 200 in table order (start time), with "Saving records 201–400 of 950…" as progress. If a batch is refused, the saved rows leave the table, the refused batch keeps its rows with each reason in the Check column, and the error says "Saved N of M records, then stopped. The next K were not saved: …". The stored records are read again, so a remaining row that duplicates a saved one shows "Already imported".
  - The new `savedSome` prop reports a partial save. `cardio-panel.tsx` reloads its list and tells the dashboard (`onChanged`) while the card stays open.

## Tests

- `frontend/src/cardio/activity-fit.test.ts` (new). The FIT files are built in the test with the SDK's `Encoder` (summary messages only, no records or GPS), and the ZIPs with `fflate`'s `zipSync`.
  - Values and Seoul time of a FIT run, including timer time rather than elapsed time and ascent kept while running cadence is not.
  - The same ID as the TCX fixture of the same run.
  - Sport and sub sport mapping, including cycling cadence.
  - Multisport sessions without transitions.
  - Out-of-range values left empty.
  - Damaged, foreign and non-activity FIT files.
  - FIT told by its signature.
  - TCX and GPX still read as text, and an unknown file reported.
  - ZIP: activity files at the top and one nested level, skipped entries, a ZIP two levels down not opened, a bad file inside reported while the rest is read, and damaged and empty ZIPs reported.
- `frontend/src/cardio/activity-file.test.ts`: the unknown-format message names FIT and ZIP.
- `frontend/src/cardio/cardio-import.test.tsx` (label renamed):
  - A FIT file inside a ZIP previewed and saved, with its elevation gain.
  - 205 rows saved in two requests of 200 and 5, oldest first.
  - A refused second batch: the 200 saved rows leave the table, the reason sits on the refused row, and the panel reloads its list.
- `e2e/cardio-import.spec.ts`: the label renamed. A new test reads a FIT run inside a ZIP in real Chrome (the lazily loaded chunks), saves it and sees it in the list. The cleanup also removes its ID.

## Verification

Local test DB: a throwaway `postgres:17-alpine` container on 127.0.0.1:15468 (tmpfs, migrated).

| Command                                                                                           | Result                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `vitest run src/cardio/activity`                                                                  | 2 files, 19 passed                                                     |
| `vitest run src/cardio/cardio-import`                                                             | 10 passed                                                              |
| `vitest run` (all of frontend)                                                                    | 67 files, 390 passed, 4 skipped                                        |
| `playwright test e2e/cardio-import.spec.ts e2e/cardio.spec.ts` (throwaway DB)                     | 3 passed                                                               |
| `npm run build -w frontend`                                                                       | passed; the SDK and `fflate` are separate chunks                       |
| `docker build ./frontend` (with the package token as a BuildKit secret)                           | passed                                                                 |
| `typecheck`, `eslint frontend/src/cardio e2e/cardio-import.spec.ts`, `prettier`                   | passed                                                                 |
| Browser check (temporary spec, not committed): the import card with a FIT row at 390px and 1440px | no page overflow; the preview table scrolls in its own region at 390px |

## Limits and follow-up

- Real Garmin FIT samples are still to come from the user (decision 3). Until then the FIT tests use files built with the SDK's own encoder, which shows the format is read but not every quirk of a device file.
- A whole-account export is read entirely in memory (`unzipSync`, with only activity entries decompressed). A very large export may be slow or run out of memory on a phone.
- The preview renders every row. Hundreds of rows work, but thousands make the table and its duplicate check slow.
- A batch refused part way leaves the earlier batches saved by design (decision 4). Re-importing the same files is safe, because saved rows are blocked as "Already imported".
