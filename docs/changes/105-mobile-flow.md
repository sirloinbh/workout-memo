# #105 Mobile input flow, step 4: 390px e2e and tap count and time comparison

- Issue: [#105](https://github.com/sirloinbh/workout-memo/issues/105)
- Branch: `test/105-mobile-flow`
- Earlier steps: [step 1 set cards](105-set-cards.md) (#232), [step 2 mobile modal](105-mobile-modal.md) (#237), [step 3 rest timer](105-rest-timer.md) (#246)

## Goal

This fills the two #105 completion criteria.

1. The "new journal → enter and complete 3 sets → save" flow passes in a real 390px browser (e2e).
2. The tap count and the time taken are recorded and compared with the earlier screen.

## Change — test: 390px touch screen flow e2e

- New file `e2e/workout-mobile-flow.spec.ts`
  - The file is only for journal editing. The journal screen code (`app.tsx`, journal) is not changed.
  - It saves to the real server and test DB at 390×844 with touch (`hasTouch`).
  - Flow: "Log workout" on the dashboard → for each set, type the exercise name "벤치프레스" (bench press), tap the right end of the total weight field to clear the 0 and type "60", press "Set N done" → "Save record". Reps keep the default 10.
  - After saving, it checks through the journal list API that 3 sets were saved as `벤치프레스 60kg × 10 reps, done`, and deletes that journal when the test ends.
  - If another spec left a "routine starting today" in the shared test DB, a new journal starts with the routine's sets. Only this test replaces the `/api/routine-progress` response with "no routine", so it always starts with 3 blank sets.
  - What is counted
    - Taps: the number of presses.
    - Keys: the number of typed characters plus Backspace. A Hangul syllable counts as 1; a real keyboard needs one key per jamo, so the real count is higher.
    - Scrolls: 1 when the point to press is off screen or covered by another element (the pinned timer bar or save bar). A long distance that one swipe cannot cover also counts as 1, so this is a lower bound. `scrolledAt` records which control the scroll was for. Measuring starts after the editor's opening animation ends.
    - Time: from the tap that opens the editor until it closes. This is Playwright pressing without pause, and it includes the test's assertion waits, so it is not a human's input time.
- How the earlier screen was measured
  - The branch `exp/105-flow-before`, made of main just before #105 step 1 (7b900c1) plus only this spec, was pushed and the same script ran in CI. Both versions used the same labels (exercise name, total weight kg, set N done, save record), so the script ran unchanged. After the first-review fixes it was measured again the same way (e9d241e). The branch is deleted after measuring.
  - On the earlier screen, the total weight field (`type="number"`) put the 0 back after it was cleared and showed "060" (saved as 60). So the test compares the numeric value 60 instead of the field text. The current screen shows "60".
  - Limit: the earlier total weight field was `type="number"`, so the rightmost 6px may overlap Chrome's number spin arrows. The measurement passed, but it was not confirmed that "1 tap + 1 Backspace" was exactly the same action on the earlier screen.

## Comparison result

| Item                       | Before #105 (7b900c1) | Now (7f0126d) |
| -------------------------- | --------------------: | ------------: |
| Taps                       |                    11 |            11 |
| Keys                       |                    24 |            24 |
| Scrolls (lower bound)      |                     3 |             5 |
| Time (automated)           |               1,578ms |       1,964ms |
| Time (previous run)        |               2,072ms |       2,110ms |
| Total weight field display |     "060" (confusing) |          "60" |

- Taps: open journal 1 + exercise name, weight and done per set 3 × 3 + save 1 = 11. Both versions match. Most of this flow is "tap one field and type a value", so the tap count did not drop. The +/- buttons are not used for sets that repeat the same weight (reaching 60kg with + takes 12 presses).
- Keys: per set "벤치프레스" 5 + Backspace 1 + "60" 2 = 8, × 3 = 24. They match. The Backspace had no effect on the earlier screen.
- Scrolls: now there are 2 more. The scrolls were for:
  - Before: set 1 exercise name, set 2 weight, set 3 done
  - Now: set 1 exercise name, **set 1 done**, set 2 weight, **set 3 exercise name**, set 3 done
  - The two new ones are the last control in a set (set 1 done) and the first control of the next set (set 3 exercise name). The set cards got bigger (weight and reps stacked below 480px, a 44px +/- button per field, a full-width done button with 48px height, a card header row), so fewer fields fit on one screen.
  - Save was pressed without a scroll in both versions. On the earlier screen the save button was in view after scrolling to set 3 done; now the save button is pinned at the bottom.
- Time: the same script measured twice varies by up to about 500ms between runs (before 2,072→1,578ms, now 2,110→1,964ms). Each run is a single measurement with assertion waits, so the difference between the versions cannot be told apart.
- Improvements this measurement does not capture: the large done button (less room to mis-tap), decimal and numeric keypads (`inputmode`), input fields not hidden by the keyboard (step 2; Playwright has no on-screen keyboard), the rest timer pinned at the top (step 3), and number fields that no longer show "060".

## Remaining work

- The 2 extra scrolls were accepted for this PR by user decision (2026-11-10). Reducing them is split into [#268](https://github.com/sirloinbh/workout-memo/issues/268) (shrink the 390px set cards to 3 scrolls or fewer). Options are shrinking the set card height (for example the +/- button size and header row below 480px) or moving focus to the next set's field after done.

## Tests

- 1 new e2e: passed in current-screen CI (102fca9, 7f0126d) and in the measurement branch CI (b1da813, e9d241e, earlier screen)
- Local: eslint (`--max-warnings 0`), prettier, and `tsc -p e2e` on `e2e/workout-mobile-flow.spec.ts` passed
- Not run: local e2e and `npm run check` (out of memory; checked in CI)

## Change — fix: first-review follow-up

The first review had no required findings and 6 suggestions; all were applied.

- Suggestion 1: a 201 save response is registered for cleanup right away. Before, if a later check failed, a journal dated today could stay in the shared test DB.
- Suggestion 2: the saved journal is read back by the POST request's real date. The promise that waited for the server's "today" is gone, so the test does not hang across midnight or when the response interception fails. It first checks that the journal was found.
- Suggestion 3: each scroll records the target control in `scrolledAt`, and both versions were measured again. The scroll causes in the comparison above are based on this record. It was not the case the review guessed ("1 of the earlier 3 scrolls is the save button").
- Suggestion 4: the point checked for reachability is the same point that is pressed, and measuring starts after the editor's opening animation ends (`opacity: 1`).
- Suggestion 5: the limit about overlapping the earlier number field's spin arrows is written above.
- Suggestion 6: the time now notes that it includes assertion waits and is a single measurement, notes the variation between runs, and says the versions "cannot be told apart".

## Merging main

- In the pre-merge check after the second review, main was ahead (#261 cardio tab, #264, #265). It had e2e, shared and `app.tsx` changes, so origin/main was merged in. There were no conflicts and `tsc -p e2e` passed. After the merge, CI (59178b9) passed, including the new e2e.
- Second merge: #269 (graph dots, including visual baselines) landed on main in the meantime and changed the e2e side, so main was merged again. No overlapping files or conflicts.
- Third merge: #124 (exercise name autocomplete; the journal set exercise name became a Combobox), #173, #271 and #258 (central standards sync, components changes) landed on main, so main was merged again. No conflicts. The autocomplete list opening under the exercise name may cover the weight field and change the scroll count, so the `[105-flow]` values in CI after the merge are checked again.
- Fourth merge (2026-11-15): main had translated the app screens to English (#277), translated docs and records (#281, #282), applied the scaffold fixes (#295) and synced central standards (#296–#302). There were no conflicts, but the spec looked up controls by their Korean labels, so it now uses the English labels ("Log workout", "New workout record", "Exercise name", "Total weight kg", "Set N done", "Save record"). The typed exercise name "벤치프레스" is user data and stays Korean so that the key counts match the earlier measurement. This record was translated to English.
