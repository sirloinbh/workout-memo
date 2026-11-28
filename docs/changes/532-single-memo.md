# #532 Keep one memo per day, written when finishing the workout

- Issue: https://github.com/sirloinbh/workout-memo/issues/532 (epic #524)
- Branch: feat/532-single-memo

## What changed

- The set cards no longer have a memo field. The editor has one "Workout memo" field (`workouts.notes`) directly above the Save button; its placeholder now also mentions form and machine settings. The base-weight hint says to leave a note "in the workout memo".
- Adding a set no longer copies the previous set's memo.

## Choice for implementation

- **Old set memos are kept and shown read-only** (the first of the two options in the issue). `sets.notes` and its values stay, so backup, restore and CSV still carry them. The workout details already list a set memo under its set; the editor now shows an older memo as "Earlier set memo: …" and saves it unchanged, so opening and saving an old workout loses nothing. The UI cannot create a new set memo. No migration and no change to the API or backup format. Reverse: fold old memos into the workout memo with a later migration.

## Tests

- New `single-memo.test.tsx`: no set memo field on a new workout; an older set memo is shown read-only and saved unchanged with a new workout memo; a new set does not copy it.

## Verification

- `npm run check` without `TEST_DATABASE_URL`; e2e and visual run in CI. Real-browser check at 390x844 and 1440x900 (frontend rule) is covered by CI e2e/visual, as in #531; the baselines are looked at in the PR.
- Visual baselines: 4 files updated (workout-editor at 360/390/768/1280) because the hint now says "workout memo"; taken from the CI artifact. Looked at the 390 image: the layout is unchanged.
