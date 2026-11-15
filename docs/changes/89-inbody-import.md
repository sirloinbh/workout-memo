# #89 Import InBody results (exported files and automatic extraction from photos)

- Issue: [#89](https://github.com/sirloinbh/workout-memo/issues/89)
- Branch: `feat/89-inbody-import`
  - It started on top of `feat/88-routine-cycle`. There is no DB change. I stacked it on to avoid conflicts, because it edits the same screen file as the earlier PRs.
  - The merge order must be #91 → #92 → #94 → #95 → #96 → this PR.

## Decisions — 2026-10-21

- We decided to do all three methods. The results of confirming how to proceed are as follows.
  - Importing an exported file (CSV): implemented
  - Automatic extraction from a photo (browser OCR): implemented. For adopting an npm package, the user confirmed to proceed after being made aware of the risk.
  - Automatic extraction from a photo (an external AI API): excluded this time (the user's decision).
- The original photo or file is not kept.
- There is no real example of the InBody export format. So columns are recognized automatically by header names, and the user sets any column that was not found directly.

## Adopting an npm package

I followed step 1 of the [verified repeatable procedures](../../skills/workout-foundation/references/procedures.md).

- Target: `tesseract.js@7.0.0` (frontend, `--save-exact`)
  - Published on 2025-12-15, the newest version that is at least 14 days old.
  - Apache-2.0, the repo github.com/naptha/tesseract.js, and 4 maintainers
- 12 transitive dependencies (checked with `npm view` and the lockfile)
  - tesseract.js-core 7.0.0, idb-keyval 6.3.0 (2026-07-08), wasm-feature-detect 1.9.0 (2026-08-11)
  - node-fetch 2.7.0 (+ tr46, webidl-conversions, whatwg-url), opencollective-postinstall 2.0.3
  - bmp-js 0.1.0, is-url 1.2.4, regenerator-runtime 0.13.11, zlibjs 0.3.1
  - All were published at least 14 days ago.
- Install: `npm install --ignore-scripts --save-exact -w frontend tesseract.js@7.0.0`
- Checks
  - The `hasInstallScript` in the lockfile is `tesseract.js`, 1 package besides the existing esbuild and fsevents. The postinstall `opencollective-postinstall` is a script that only prints a donation notice (I checked the content), and it was not run because of `--ignore-scripts`.
  - No IOC strings (webhook.site, ngrok.io, and others) were found in the tesseract.js and core files. There is no workflow file change either.
- subtree lockfile: I regenerated `frontend/package-lock.json` in a temp directory with `npm install --package-lock-only --ignore-scripts --before=2026-10-07`. It is pinned to the same version.
- Docker: `docker build ./frontend` succeeded
- Network at run time
  - By default, tesseract.js downloads the OCR worker, the core (wasm), and the Korean and English language data from the jsdelivr CDN. It is pinned to the same version (7.0.0).
  - The image and the recognition result are not sent outside.
  - There is no CSP header, so there is no restriction on operation. Self-hosting is follow-up work.
- Bundle: it is a dynamic import, so it was split into a separate chunk (about 16 kB). The main bundle grew by about 8 kB for the import screen. The over-500 kB warning is the same as before.
- Cost: it is processed in the browser, so there is no server or API cost (no effect on the $10 monthly budget).

## Change

- `frontend/src/inbody.ts` (new, pure functions)
  - CSV parsing: BOM, quotes, CRLF, and comma, semicolon, and tab delimiters
  - Header recognition: Korean and English names, ignoring case, spaces, and unit in parentheses. A column written in lb is not linked to kg.
  - Dates: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, and `YYYYMMDD`, with a time allowed after. Anything else is left empty.
  - Numbers: only the units kg and % are removed, and anything else is left empty.
  - Photo text: it uses only the value right after a label on the same line. It does not use other items such as 체중조절 (weight control) and 체지방량 (body fat mass).
- `frontend/src/inbody-import.tsx` (new): "인바디 가져오기" (import InBody) on the body records screen
  - When you choose a file, it shows the CSV column assignment and an editable preview.
  - It validates each row with the shared contract `bodyMeasurementSchema`. A wrong row cannot be selected for saving, and the reason is shown.
  - Only the selected rows are saved one at a time with the existing `POST /api/body-measurements`. A failed row (for example a date that is already recorded, 409) keeps its values and reason.
  - Photo: it loads `tesseract.js` dynamically and recognizes with `kor+eng`. You can expand the recognized text to view it.
- There is no change to the server, DB, or API contract.

## Tests

- `frontend/src/inbody.test.ts` (new)
  - The CSV format, column recognition (excluding pounds), and date and number normalization boundaries
  - Keeping empty values
  - Extracting only label values from the result sheet text
- `frontend/src/inbody-import.test.tsx` (new, tesseract.js is mocked)
  - The CSV preview, saving blocked for a row with a bad date and saving after a fix, and clearing a value → null
  - Keeping a 409 row
  - Setting a column directly
  - Photo: a preview with the recognized values, and values it could not read are left empty. The save request has no image, only values.
- I did not automatically test the real photo recognition rate (OCR results depend on the photo quality). I made the user always check in the preview.

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 303 pass, 0 skip
  - Frontend 109 pass
  - Workers 162, skills 4, docs 3, and build pass
- `npm run test:e2e` (the same test DB): 4 passed (including the 320px and 390px layouts)
- `docker build ./frontend`: succeeded

## Limits and follow-up

- External AI API extraction is excluded. If needed, decide the scope of key management, cost, and personal information and proceed in a separate issue.
- I could not check the column names with a real InBody export file. If the automatic recognition fails, you can pick the columns directly, and if I get an example file, I will add to the name list.
- Self-hosting the OCR engine and language data (removing the CDN dependency) is follow-up work.
