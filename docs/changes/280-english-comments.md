# #280 Translate Korean code comments to English

## Problem

Issue #280 asked that no code comment in the repo be Korean. The count in the issue (about 98 files) came from a scan for any Hangul, which also matches Korean data values, not only comments.

## Change

- Searched every tracked code file (`ts`, `tsx`, `mjs`, `js`, `sql`, `ps1`, `yml`, `css`, `html`, `sh`) for Hangul on comment lines. Nearly all comments were already English.
- `backend/test/routine-progression.test.ts`: added English glosses next to the two quoted Korean issue-comment titles. The Korean titles are kept because they are quotes.
- Left unchanged on purpose: Korean body-part names, brand and lineup names, InBody CSV header names, and similar values that appear inside otherwise English comments (for example `// #88: 이두·삼두 replace 팔 ...`). They name real data values that the code matches on.

## Verification

- Hangul search over comment lines: the only remaining Korean is the data values above and the two quoted titles.
- No behavior change: only comment text changed. Lint, typecheck, and tests could not run locally because the main clone has no installed `node_modules`; CI runs them.
