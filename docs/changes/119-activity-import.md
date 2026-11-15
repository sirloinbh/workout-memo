# #119 Activity file import (1): TCX and GPX, preview, duplicate prevention

- Issue: [#119](https://github.com/sirloinbh/workout-memo/issues/119)
- Branch: `feat/119-activity-import`
- Research: #118 [`docs/activity-import.md`](../activity-import.md) (PR #265)
- Preceded by: #114 (cardio model) and #115 (cardio screen), both merged

## Purpose

Upload activity files exported from Garmin Connect or similar and bring them in as cardio records. This PR (1) reads TCX and GPX, which need no new package, and builds the preview, duplicate prevention and bulk save. FIT and ZIP need package installs (`@garmin/fitsdk`, `fflate`), so they go to PR (2).

| PR  | Content                                                                               |
| --- | ------------------------------------------------------------------------------------- |
| 1   | Read TCX and GPX, preview (edit, exclude, duplicate hints), bulk save API, e2e        |
| 2   | FIT (`@garmin/fitsdk`, `total_timer_time`) and ZIP (`fflate`), after install approval |

## User decisions (2026-11-08, #119 comment)

1. Entry point: the "Import file" button in the header of the cardio tab's record card opens an import card under the list card.
2. Preview editing: the table edits only the save check, type, date and start time. Everything else goes through the row's "Edit" button, which opens the cardio form (CardioForm) in a preview edit mode that sends nothing to the server.
3. Saving: `POST /api/cardio-sessions/import` saves everything in one transaction or nothing. A refused row comes back with its reason by row number.
4. Duplicates: the same source and external ID cannot be saved. Duplicate candidates from a different source (start within 2 minutes, or the same date when there is no start time; distance within 1%, or duration within 1% when there is no distance) and look-alike rows in the same batch are unchecked by default with a hint, and are saved if the user checks them.
5. GPX duration runs from the first to the last point (pauses included, with a note in the preview). The external ID, type mapping, distance calculation and elevation gain are as described below.

## Change - feat: read TCX and GPX

- `frontend/src/cardio/activity-file.ts` (new): reads with the browser `DOMParser`. The file is never sent to the server or stored (the track can show where the user lives).
  - TCX: the sum of each lap's `TotalTimeSeconds` (timer time, pauses excluded), the sum of `DistanceMeters`, the sum of `Calories`, average heart rate as a lap-time-weighted average, and maximum heart rate as the largest lap maximum. `Notes` becomes the memo. The type comes from `Sport`: Running becomes Running, Biking becomes Outdoor cycling, Other becomes Other.
  - GPX: there are no summary values, so they are computed from the points. Duration runs from the first to the last point. Distance is the sum of haversine distances between points inside a segment; gaps between segments (lost signal) are not added. Heart rate is the average and maximum of the Garmin `TrackPointExtension` `hr`. The type comes from a word in `trk/type` (run, walk, hike, cycling, ride, swim, row and so on); unknown words become Other.
  - The start time converts UTC to an Asia/Seoul date and HH:MM (the next day after midnight).
  - The external ID is the start time (UTC ISO, to the second, `2026-11-01T22:10:05Z`) and the source is `file`. Uploading the same file again is blocked as "Already imported". The TCX and GPX of the same activity usually share the ID, but the GPX drops points without a position, so its start can be a few seconds late. Then the IDs differ and it is only asked about as a start-within-2-minutes duplicate candidate, and if the GPX distance (gaps between segments excluded) or duration (pauses included) differs from the TCX by more than 1%, it may not be caught as a candidate either (review round 1). A time without a time zone is read as UTC.
  - Values not read: elevation gain (TCX has no summary and GPX calculations are too inexact), cadence (running cadence is counted per foot or per both feet depending on the exporter; only TCX cycling `Lap/Cadence` is read), laps and GPS routes (decided in #114).
  - Out-of-range values (for example heart rate 300, or a maximum heart rate below the average) are treated as device errors and left empty. They do not block the whole row. Required values that cannot be left empty (a workout time of 0 seconds or over 24 hours, a distance over 1000 km) show as an invalid-value row and must be fixed with "Edit" before saving.
  - A damaged XML file, a file of another format, or a file with no activities or timestamps is shown with its file name and the reason, and the remaining files are still read.

## Change - feat: preview and duplicate prevention

- `frontend/src/cardio/cardio-import.tsx` (new): `CardioImport`. It has the same card, horizontally scrolling table and save check box look as the InBody import (#89).
  - Several files can be chosen at once, and activities are shown in start-time order.
  - Table columns: Save, Type (selectable), Date, Start, Record (duration, distance, average heart rate and the file name, read-only), Check, Edit.
  - Check column: Ready to save / invalid value (the shared contract message) / Already imported / Same activity as row N / Possible duplicate (an existing record name or row N). The first three cannot be checked; a possible duplicate is unchecked by default and is saved once checked. When two rows in a batch share an ID, the earlier row blocks the later one only while the earlier row is selected, so either copy can be chosen (for example the TCX without pauses). If the user picked the later row by hand, the earlier row is not selected by default even after it is fixed and becomes savable (review round 2).
  - The default selection applies only to rows the user has not checked or cleared, and is decided again whenever the existing records are reloaded or a row value is edited. A row that newly becomes a possible duplicate therefore does not stay selected.
  - Editing a date keeps loading the range around the date read from the file, so "Already imported" is still found. If a save is refused with 409 (for example imported in another tab), the existing records are reloaded.
  - Opening the card moves focus to the file input; closing or saving moves it back to the "Import file" button. The file input, disabled while files are read, also gets its focus back afterwards.
  - The "Strength journal to link" field in the edit dialog offers only journals in the panel's period (the list is empty for a row dated outside it). The link can be made from the list after saving.
  - The duplicate check loads the period one day either side of the row dates with `GET /api/cardio-sessions` and compares on screen. It loads again when a date edit changes the range.
  - When a GPX file is present, a note says pauses are included.
- `frontend/src/cardio/duplicates.ts` (new): `isSameActivity` (same source and external ID) and `isSimilarActivity` (start within 2 minutes, or the same date when one side has no start time; distance within 1%, or duration within 1% when one side has no distance). Later Garmin and Nike syncs will use the same rules.
  - Hand-entered records often have no start time, so a missing start time is compared by date. These are only candidates, and they are saved if the user checks them.
- `frontend/src/cardio/cardio-form.tsx`: an optional `apply` prop. When set, the title is "Edit imported record" and the button is "Apply to preview"; the form only returns the values that passed the same validation and does not send them to the server. The source and external ID are kept.
- `frontend/src/cardio/cardio-panel.tsx`: the header gets an "Import file" (secondary) button that opens the import card under the list card. After saving, the card closes, "Imported N cardio records" is announced, and the list, statistics, personal records and dashboard summary are reloaded.
- `frontend/src/cardio/api.ts`: `importCardioSessions`. The central `requestJson` keeps only the error message and cannot read the per-row reasons (`rows`), so this request reads the response itself and passes them on as `CardioImportError.rows` (the central file is not changed).

## Change - feat: bulk save API

- `backend/src/routes/cardio.ts`: `POST /api/cardio-sessions/import` with `{ sessions: [...] }` (1 to 200 rows).
  - Each row is validated with the same schema as `POST /api/cardio-sessions`, the source must not be `manual`, and an external ID is required. If the same source and external ID appear twice in the request, the later row is refused. If any row is wrong, the response is 400 with `rows: [{ index, message }]`.
  - Inside the transaction it looks for an already saved same source and external ID; if one exists it rolls back and answers 409 with that row number. A concurrent import of the same activity that hits the unique index, or a link to a strength journal that does not exist, answers with the existing `appErrors` messages (409 and 400) and keeps nothing.
  - Success is 201 `{ sessions: [...] }` in the order sent.
  - A 413 states the limit, as the backup path does: "Request size limit exceeded (imports up to 2 MB at a time)." (`routes/shared.ts`)
  - The 200-row limit and 2MB body: so that 200 rows with long memos (up to 2000 characters, about 6 KB of Hangul) fit, this path alone registers its own JSON parser before the global 256kb parser, like the backup path (`app.ts`). The screen disables the save button when more than 200 rows are selected and tells the user to deselect some. How to send a whole-account export (ZIP) in pieces is decided in PR (2).
- `backend/src/openapi.ts`, `docs/openapi.json`, `docs/api.md`: the new path and response format.

### Server messages (English)

The branch's Korean messages were translated after #277. The new ones: `Send the cardio records to import (sessions) as an array`, `Select at least 1 cardio record to import`, `You can import up to 200 cardio records at a time`, `Imported records need a source (file, garmin or nike) and an external ID`, `Same activity as row N`, `N records have problems, so nothing was saved` (`1 record has a problem, ...` for one), `This activity was already imported`, and the 413 message above.

## Tests

- `frontend/src/cardio/activity-file.test.ts`: values from Garmin-style TCX (2 laps) and GPX (2 segments) fixtures, the Seoul time conversion (across midnight), type mapping, out-of-range values, errors for damaged and other-format files, and a file with no extension.
- `frontend/src/cardio/duplicates.test.ts`: the borders of same activity and duplicate candidates (2 minutes, 1%, midnight, no start time, no distance).
- `frontend/src/cardio/cardio-import.test.tsx`: preview of several files and the note for an unreadable one, duplicate candidates unchecked by default, an already imported record that cannot be checked, table and form edits reaching the saved body while the form makes no request, and per-row reasons on refusal.
- `backend/test/cardio.test.ts`: validation failure row numbers (without queries), an already saved activity leading to ROLLBACK and 409, and BEGIN, SELECT, INSERT, COMMIT on success.
- `backend/test/cardio.integration.test.ts`: saving on PostgreSQL, re-import giving 409 with 0 rows saved, and a full rollback when something fails inside the transaction.
- `e2e/cardio-import.spec.ts`: at 390px, choose a TCX file, preview, save, see it in the list and after a reload; the same file cannot be checked.
- The fixtures (`frontend/src/cardio/fixtures/`) are hand-made files shaped like Garmin exports. They hold no real person or place information. If real Garmin files are needed, ask the user (2026-11-08 decision).

## Impact

- The cardio tab's list card header gets an "Import file" button, which changes the four `journal-cardio` visual baselines. With two buttons beside the title, the title wraps to one character per line at 390px and the period wraps at 768px, so under a header width of 36rem the buttons move to a row under the title (container query; confirmed with the CI baseline images).
- No DB migration (it uses #114's `source='file'`, `external_id` and unique index).

## Merging main (2026-11-15)

`origin/main` was merged into this branch after #277 (English screen text and messages), #280 (English code comments) and #281 and #282 (English docs). Conflicts were in `docs/api.md`, `frontend/src/cardio/cardio-form.tsx` and the four `journal-cardio` baselines.

- `docs/api.md` and `cardio-form.tsx` keep main's English text plus this branch's additions. The baselines take main's version; see Visual baselines below.
- Everything this branch had added in Korean was translated to English in main's style: UI labels and aria-labels, the server and validation messages above, code comments, unit, backend and e2e tests, the two fixtures' user data, `docs/api.md` and this record. Behavior is unchanged. One test memo in `backend/test/cardio.test.ts` is built from a Hangul syllable (U+AC00), on purpose to test the UTF-8 size limit.
- Accessible names changed with the text, for example `Save row N`, `Row N type`, `Row N date`, `Row N start time`, `Edit row N`, `Import file`, `Import activity file` and `Import preview`. They follow the pattern used elsewhere (`Edit cardio record ...`).
- `docs/openapi.json` was regenerated with `npm run openapi`.

### Visual baselines

The four `journal-cardio-{360,390,768,1280}.png` files are main's. The "Import file" button changes this screen, so they probably need regenerating in the CI-pinned Playwright container as `skills/workout-testing/SKILL.md` describes; this was not done locally.
