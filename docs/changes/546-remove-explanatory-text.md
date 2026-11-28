# #546 Remove explanatory, example and motivational text

- Issue: [#546](https://github.com/sirloinbh/workout-memo/issues/546) (tracking: sirloinbh/project-standards#1216; rule: design-system `docs/guidelines.md`, "Screen text rule")

## Changes — 2026-11-29

Search used: `description=`, `e\.g\.`, `placeholder=`, `aria-describedby`, `-hint` ids and `text-muted-foreground` paragraphs in `frontend/src` (not tests, not the UI kit).

Removed:

- Page header text in `app.tsx`: the eyebrow "YOUR PROGRESS, IN FOCUS", the motivational titles ("A place to record consistency", "Toward the next you", "Knowing your machine makes your records accurate", now "Dashboard", "My Goals", "Machine Library" like the menu) and the descriptions ("See how your training flows ...", "Set concrete growth goals ...", "Save machines and base weights ..."). The Day log header keeps the date and routine name.
- Body records header: eyebrow "BODY CHANGES, SIDE BY SIDE", title "Track your body changes too" (now "Body records") and its description.
- Empty-state lines: "Your growth story starts with today's sets.", "e.g. Leg Press total weight ...", "e.g. 3 runs a week ...", "An unconfirmed base weight ...", "Enter values only for the days you measured ...".
- Intro paragraphs: cardio goals intro, routine builder intro and "A plan is only a goal ...", cardio preview note, split editor note, "Equal values are shown as ties.".
- Placeholders: "Not entered" (body, cardio, InBody import), "0", and the goal exercise name prompt. The backup confirmation placeholder stays: it shows the text to type.

Not touched: `workout-editor.tsx` and `settings.tsx` (workout-memo-36 lanes still change them, #532 and #528); come back to them after epic #524 closes. The "About the analysis basis" details block stays because it states how the numbers are calculated.

Tests: one empty-state assertion on removed text is gone. Visual baselines are taken from the CI artifact.
