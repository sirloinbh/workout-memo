# #505 Translate the remaining Korean screen text to English

- Issue: https://github.com/sirloinbh/workout-memo/issues/505
- Branch: feat/505-english-screen-text

## Findings

A grep for Hangul outside tests found the following. Most is not screen text:

- Body part keys (`가슴`, `등`, ...) are stored values; every screen shows them through `bodyPartLabel` (English). They stay as keys so saved routines, mappings and backups keep working.
- `frontend/src/inbody.ts` reads Korean column headers from InBody exports (input parsing, not display).
- The brand name `기타`, the lineup `온힘` and 33 official-weight notes were seeded in Korean and shown in the Machine Library.
- The API description said the restore confirmation was Korean (`전체 교체`), but the code and the screen use `Replace all`.

## Changes

- Migration `024_english_catalog_text.sql` translates the brand (`Other`), the Newtech lineup (`On Him`) and the 33 official-weight notes. It matches rows by id and only while they still contain Hangul.
- `openapi.ts` now names the real confirmation phrase.
- Tests that named the Korean brand and lineup now use the English names.

## Verification

`npm run check` with the backend integration tests run against a local PostgreSQL 17.
