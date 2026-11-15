# #117 Cardio items in routines, part 1: plan, builder and preview

- Issue: [#117](https://github.com/sirloinbh/workout-memo/issues/117) (decisions in the 2026-11-16 issue comment)
- Branch: `feat/117-routine-cardio`
- Part 1 of 3. Part 2: show the day's cardio on the today routine card and pre-fill the cardio record (#115). Part 3: cardio achievement rate of the routine in progress.

## Decisions (user, 2026-11-16)

1. Cardio items go on a split and are done after that split's strength work on its days. No separate cardio days, so the #88 rest-day selection is unchanged.
2. Steady targets grow 10% a week, rounded to 1 minute or 0.1 km; weeks 4, 8 and 12 are deloads at 80% of the week before, and the week after continues from the week before the deload. Intervals keep their structure.
3. No default program template now (a separate issue later).

## Change: feat

- `shared/contract.ts` (synced to the backend and frontend copies):
  - `routineCardioSchema`: `kind` (a cardio record type), `intensity` (`zone2`, `tempo`, `interval`, `recovery`), and either `minutes` (1 to 600, whole) or `distance_km` (0.1 to 500, 1 decimal) for week 1, or `interval: { repeats 1–50, work_sec 5–3600, recovery_sec 0–3600 }` for an interval item, which takes no time or distance. Each wrong combination has its own message.
  - `cardioWeeklyTargets(item)`: the 12 weekly targets. The +10% compounds from week 1 and each week is shown rounded, so short targets still grow (4 min: 4, 4, 5, 4, 5, 6 …) and a shown step can differ a little from 10%. The running value stops at the input maximum, so a deload is still 80% of the capped week. Interval items return `null`.
- `backend/src/domain.ts`: `routineSchema` takes an optional `cardio` array of up to 10 items per split. Plans are stored in the existing `routines.plan` jsonb column, so there is no migration; older plans without `cardio` are unchanged.
- `frontend/src/routines.tsx`:
  - Step 3: under each split's exercises, "Add cardio" adds an item (Running, Zone 2, time). Each item has Cardio type, Intensity, then Target (Time or Distance) with Week 1 minutes or Week 1 km, or for an interval Repeats, Work seconds and Recovery seconds (6 × 60 s / 60 s to start). Switching to or from Interval swaps the fields; "Delete cardio" removes an item. Up to 10 per split.
  - Step 4 and the plan view: "Cardio · 12 weeks" lists each split's items with their weekly targets (for both goal modes). The plan view also lists the items under their split.
  - The saved plan carries only the item's own target fields as numbers; a split without cardio has no `cardio` key, as before.
- `docs/api.md` and `docs/openapi.json` describe the new field.

## Tests

- `backend/test/routine-cardio.test.ts` (new): weekly targets for a timed item (30 → 33 → 36 → deload 29 → 40 … 51), a distance item in clean 0.1 km steps, the input maximum, and `null` for intervals.
- `backend/test/routines.test.ts`: a split keeps steady and interval items; missing or doubled targets, too many decimals, repeats on a steady item, an interval without repeats or with a time, and an unknown type are each rejected with their message.
- `frontend/src/routines.test.tsx`: adding a timed and an interval item, the step 4 weekly targets, the posted `cardio` (and no key on other splits), and the plan view; switching a target to distance and deleting an item.
- `e2e/ui-touch.spec.ts`: the Routine Builder check adds a steady and an interval item in step 3 and sees the cardio preview in step 4 (touch sizes and axe).
- Local test DB: a throwaway `postgres:17-alpine` container on 127.0.0.1:15468 (tmpfs, migrated). The shell's global `TEST_DATABASE_URL` pointed at another project's database on a port with nothing listening; a first backend run against it only failed to connect and was stopped, then the suite ran against the throwaway DB.

| Command                                                                                    | Result                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `npm run test -w backend` (`TEST_DATABASE_URL` = throwaway DB)                             | 378 passed, 0 skipped                               |
| `npm run test -w frontend`                                                                 | 65 files, 368 passed, 4 skipped                     |
| `npm run test:e2e -- e2e/ui-touch.spec.ts e2e/ui-a11y.spec.ts e2e/ui-responsive.spec.ts`   | 41 passed                                           |
| `format:check`, `lint`, `contract:check`, `typecheck`, `test:skills`, `test:docs`, `build` | passed (run one by one, not as one `npm run check`) |
| Browser check: step 3 at 390px, cardio preview at 1440px                                   | fields in two columns at 390px; weekly targets wrap |

## Review round 1

No blocking findings (the reviewer checked the rounding against integer arithmetic over every input step, deload continuation, server re-validation, and that backup restore, routine progress and exercise suggestions carry or ignore `cardio` correctly). Applied:

- Short targets never grew: rounding each week from the shown value kept 1–4 min and 0.1–0.4 km flat. The progression now compounds from week 1 and rounds only for display; the running value is capped at the input maximum, so deloads stay 80% (600 → 480 min, not 600). The 5 km example becomes 5, 5.5, 6.1, 4.8 … (was 4.9). Tests: short targets, the cap, updated sequences; the loose "≤ 10%" loop that asserted nothing was removed.
- `distance_km` decimals are checked exactly (5.00000001 was accepted), and an out-of-range value gets one message instead of two. Test: 5.25, 5.00000001 and 0.05.
- Switching an item to Interval and back keeps its typed time or distance (not sent while it is an interval). Test: the switch keeps 5 km.
- Cardio field names carry a visually hidden "(split N, cardio M)" so the repeated names are told apart by screen readers. Test: the field is found by its full name.
- Test: an 11th cardio item on a split is rejected.

Not applied: a hint when Add cardio is disabled at 10 items; previews of out-of-range typed values before Next's browser check blocks them; backup and route round-trip tests (the reviewer traced both paths and found `cardio` carried through).

Checks: `npm run test -w backend` (throwaway DB) 380 passed, 0 skipped; `npm run test -w frontend -- routines` 15 passed; routine ui-touch e2e 3 passed; `lint` and `typecheck` passed.
