# Keep large Garmin imports responsive (#387)

Issue: https://github.com/sirloinbh/workout-memo/issues/387

## Purpose

A whole-account Garmin export (hundreds of MB, thousands of activities) unzipped and parsed FIT files on the page's main thread, which froze it. Every render also re-checked every preview row against every other row (n²), every edit copied the rows, and the table drew all of them.

## Changes

- `frontend/src/cardio/activity-worker.ts`, `activity-worker-core.ts`: unzipping and FIT parsing run in a Web Worker, one request per chosen file, with progress after each entry of a ZIP. A worker has no `DOMParser`, so TCX and GPX text comes back (`xml: 'defer'` in `readActivityFile`, new `parseDeferred`) and the page parses it, yielding between batches of files.
- `frontend/src/cardio/activity-reader.ts`: `readActivityFiles` runs the worker per file and returns a promise and `cancel()`. Without a `Worker` (jsdom) the same work runs on the page.
- `cardio-import.tsx`: the status line shows the file and how many of its entries are read, and **Cancel reading** stops the worker and leaves the table unchanged.
- `frontend/src/cardio/import-check.ts` (new): the per-row save check, moved out of `cardio-import.tsx`. An index by external id and by date finds the few rows a row can relate to (no n² scan), the schema is built once per date, and the answer is kept on the row (`Row.check`). A cell edit or a check box re-checks only the rows connected to that row (`affectedBy`).
- The preview table shows 100 rows at a time with "Previous rows" and "Next rows"; the save count still covers all pages.

## Verification

- `import-check.test.ts`: one cell edit among 2,000 synthetic rows re-checks one row; an edit that makes two rows look alike re-checks both; the indexed check gives the same answers as the old all-rows check on 60 random sets of look-alikes, twins and stored sessions.
- `activity-worker.test.ts`: the worker side unzips a small ZIP, reports progress and returns the XML; the page side parses it; a fake `Worker` shows progress and Cancel stopping it.
- `cardio-import.test.tsx`: 120 rows are shown as 100 + 20 with the right row numbers and save count.
- `npm run check`: passed (the build bundles the worker). The e2e job in CI runs the import in a real browser, where the worker path is used.

## Limits

- The worker is not run in the unit tests (jsdom has no `Worker`); its logic and the page's use of it are tested through `readInWorker` and a fake `Worker`. The real browser run is the e2e job.
- The progress shows entries of the chosen ZIP, so one huge nested ZIP shows one step until it is unpacked.
- `activity-deps.ts`: a worker bundle cannot code-split, and `vite.config.ts` is a centrally managed file, so the worker format cannot be changed here. `activity-file.ts` therefore asks `activity-deps.ts` for `fflate` and `@garmin/fitsdk`: the page registers lazy loaders (`activity-deps-lazy.ts`) and the worker registers static imports. Tests that call `readActivityFile` directly import `activity-deps-lazy`.
