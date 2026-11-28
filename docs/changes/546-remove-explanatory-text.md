# #546 Remove explanatory, example and motivational text

- Issue: [#546](https://github.com/sirloinbh/workout-memo/issues/546) (tracking: sirloinbh/project-standards#1216; rule: design-system `docs/guidelines.md`, "Screen text rule")

## Changes — 2026-11-29

Search used: `description=`, `e\.g\.`, `placeholder=`, `aria-describedby`, `-hint` ids and `text-muted-foreground` paragraphs in `frontend/src` (not tests, not the UI kit).

Removed:

- Page header text in `app.tsx`: the eyebrow "YOUR PROGRESS, IN FOCUS", the motivational titles ("A place to record consistency", "Toward the next you", "Knowing your machine makes your records accurate", now "Dashboard", "My Goals", "Machine Library" like the menu) and the descriptions ("See how your training flows ...", "Set concrete growth goals ...", "Save machines and base weights ..."). The Day log header keeps the date and routine name.
- Body records header: eyebrow "BODY CHANGES, SIDE BY SIDE", title "Track your body changes too" (now "Body records") and its description.
- Empty-state lines: "Your growth story starts with today's sets.", "e.g. Leg Press total weight ...", "e.g. 3 runs a week ...", "An unconfirmed base weight ...", "Enter values only for the days you measured ...".
- Intro paragraphs: cardio goals intro, routine builder intro and "A plan is only a goal ...", cardio preview note, split editor note, "Equal values are shown as ties.".
- Dashboard: the chart caption "Growth that gets clearer as your records build up", the whole "THE NEXT CHAPTER / A little heavier. Do it once more." promo card, the record list caption "So today's effort becomes tomorrow's baseline" and the page footer "Today's record creates tomorrow's change.".
- Card captions that explained a screen: analysis (records and body part totals), body records, cardio records, goal progress, record board, machines.
- Rule explanations: the auto goal rule text ("Auto goals (double progressive overload) ..." in the journal, the routine builder and the plan view; the `autoRule` constant is gone), the body record save note and the "does not imply a causal link" disclaimer, the cardio goal judging note, the InBody import note.
- Placeholders: "Not entered" (body, cardio, InBody import), "0", and the goal exercise name prompt. The backup confirmation placeholder stays: it shows the text to type.

Also removed once epic #524 closed (workout-editor.tsx and settings.tsx were free): the Settings description and card captions, the workout editor's draft storage note, the set entry and completion explanations (the "Completed N / M sets" count stays) and the title and memo placeholders.

The "About the analysis basis" details block stays because it states how the numbers are calculated.

Tests: one empty-state assertion on removed text is gone. Visual baselines are taken from the CI artifact.
