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
4. More than 200 chosen rows are saved in batches of 200, in the order of the table (start time as read). Each batch is all or nothing. A refused batch stops the save, and the batches before it stay saved.

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
    - Errors by file name: not a FIT file, damaged (the CRC check fails, or decoding fails before any session), and a FIT file without an activity summary (for example a settings file; inside a ZIP these are only counted, see review round 1).
  - `readActivityFile(name, bytes)`: one chosen file → `{ activities, problems, skipped }`. ZIP (by extension or the `PK` signature) is opened with `fflate`, also loaded on demand. Activity files inside are read the same way and named `archive.zip › file.fit`. One nested ZIP level is opened, as in Garmin's whole-account export. Other entries (JSON, images, `__MACOSX`, dot files) are skipped. A damaged ZIP and a ZIP without activity files are reported. FIT is also told by its `.FIT` signature when the name has no extension. A bad file inside a ZIP does not stop the others.
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
- `frontend/src/cardio/activity-fit.test.ts`, real device file: `fixtures/garmin-run.fit` (112 bytes) was rebuilt with the SDK encoder from the session values of one real Garmin watch run. It holds only a `file_id` (type, manufacturer, no serial number) and a `session` (sport, start time, timer and elapsed time, distance, heart rate, calories, ascent). The GPS records, laps, device info and user profile were not copied. The test asserts type, Seoul date and time, duration, distance and the other summary values as the real file gave them, and that the file is also read inside a ZIP.
- `frontend/src/cardio/activity-file.test.ts`: the unknown-format message names FIT and ZIP.
- `frontend/src/cardio/cardio-import.test.tsx` (label renamed):
  - A FIT file inside a ZIP previewed and saved, with its elevation gain.
  - 205 rows saved in two requests of 200 and 5, in table order.
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

- The FIT tests now include a fixture made from a real Garmin watch file (see Real FIT samples below). The other FIT tests still use files built with the SDK encoder.
- A whole-account export is read entirely in memory (`unzipSync`, with only activity entries decompressed). A very large export may be slow or run out of memory on a phone.
- The preview renders every row. Hundreds of rows work, but thousands make the table and its duplicate check slow.
- A batch refused part way leaves the earlier batches saved by design (decision 4). Re-importing the same files is safe, because saved rows are blocked as "Already imported".

## Real FIT samples (10 files, 2026-11-18)

The user's 10 Garmin watch exports (kept only in the ignored `.local/fit-samples/`, never committed) were run through `readActivityFile` with a throwaway local script, one by one and then all together as one ZIP.

| #   | Sport (sub sport) | Duration (timer) | Distance | Result                          |
| --- | ----------------- | ---------------- | -------- | ------------------------------- |
| 1   | running (generic) | 17 min 48 s      | 2.30 km  | imported                        |
| 2   | running (generic) | 54 min 56 s      | 6.01 km  | imported                        |
| 3   | running (generic) | 25 min 25 s      | 2.59 km  | imported                        |
| 4   | running (generic) | 48 min 3 s       | 6.28 km  | imported                        |
| 5   | running (generic) | 55 min 22 s      | 7.67 km  | imported                        |
| 6   | running (generic) | 43 min 48 s      | 6.01 km  | imported                        |
| 7   | running (generic) | 44 min 38 s      | 5.63 km  | imported                        |
| 8   | running (generic) | 13 min 58 s      | 1.54 km  | imported                        |
| 9   | running (generic) | 45 min 20 s      | 6.07 km  | imported (used for the fixture) |
| 10  | running (generic) | 59 min 30 s      | 5.61 km  | imported                        |

- All 10 are activity files that pass the CRC check, decode with no errors, and hold one session each. None was refused and none errored. Every file's Seoul date and start time matches the local time in its name, including one that starts at 23:57 and one whose UTC date is the day before.
- All 10 together in one ZIP: 10 activities, no problems, none skipped.
- Heart rate, calories and ascent were in range in every file. Running cadence is not read by design.
- No bug was found, so no importer change was needed.

## Review round 1

No blocking findings. The reviewer checked against the SDK source:

- the units after `applyScaleAndOffset`, and the `Date` start time;
- that `checkIntegrity` accepts a header CRC of 0 and a 12-byte header;
- that exactly one nested ZIP level opens;
- the row-index mapping of a refused batch, and the single reload after a partial save.

Applied:

- **Non-activity FIT files in a ZIP** (settings, daily health data) are counted into one line ("Skipped N FIT files without an activity summary …") reported by the chosen ZIP. Before, each one was its own error line, which would bury the real problems of a whole-account export.
- **Size cap:** an activity entry over 50 MB inside a ZIP is not unpacked and is reported ("Too large for an activity file"). Nested ZIPs are not capped.
- **Timer time of 0:** the duration falls back to the elapsed time, instead of a 0-second row that fails validation.
- **Decoder errors:** `Decoder.read()` returns errors instead of throwing, so the dead `try`/`catch` is gone. A file whose decoding failed with no sessions is now reported as damaged, not as "No activity summary". Sessions read before a later error (for example a damaged second file chained after the first) are still used.
- **Unopenable file:** a file that cannot be read after it was chosen (moved or deleted) is named in the errors ("Could not open the file. Choose it again."), and the other files are still read. Before, the card stayed on "Reading files…".
- **Save order wording:** batches follow the table order, which is the start time as read; an edited date does not re-sort. The note now says "in the order of the table", and this record says the same.

Tests added: the timer fallback, a session without a start time, the counted non-activity FIT files (top level and nested), the 50 MB cap, and the unopenable file on the card.

Not applied:

- Full paths for ZIP entry names: Garmin's file names are unique IDs, and full export paths would make the labels very long.
- A guard against a fast second click after a partial save: the server's unique index refuses a duplicate with 409, and the card then reloads.

Checks: `vitest run src/cardio` 10 files, 97 passed; `typecheck` and `eslint` passed.

## Review round 2

No blocking findings. The reviewer confirmed each round 1 fix against the SDK and fflate sources:

- Only non-activity FIT files inside a ZIP are counted; a standalone one keeps its own error.
- The skipped count is summed through nested ZIPs and reported once.
- The 50 MB filter reads the central directory's size, and `unzipSync` never allocates more than that size for an entry.
- Problems pushed inside the filter are dropped if the ZIP then fails to open.

Applied:

- A test for a FIT file that passes the CRC but fails to decode, which is now reported as damaged.
- Stale "oldest first" wording in this record, and the `skipped` field in the `readActivityFile` description.

Not applied (noted):

- Nested ZIPs are not capped. A forged size of several GB fails to allocate and is reported as a damaged ZIP.
- Sessions read before a later decoding error are kept without telling the user that part of the file was dropped.
