# #173 Use the shared Skeleton for the loading display of cardio stats and personal records

Following #250 and #270, this changes two places of the cardio screens that do not overlap with other work.

## Change

- Cardio stats (`cardio/cardio-stats.tsx`): while loading for the first time, it shows a `SkeletonCard` instead of the text "통계를 불러오는 중…" (loading stats…). It is placed inside the `aria-busy` region "유산소 통계" (cardio stats), and the status line is kept as `sr-only`.
- Personal records (`cardio/cardio-records.tsx`): while loading, it shows a `SkeletonList` (region name "개인 기록" (personal records)). If loading fails, only the error banner is shown as before.
- The cardio goals (`cardio-goals.tsx`) already use the shared Skeleton and Spinner, so they were not changed.

## Out of scope

- The cardio record list (`cardio/cardio-panel.tsx`) and the record save button (`cardio/cardio-form.tsx`) are being changed in the same files by agent2's #266 (activity file import), so I change them after that PR is merged.

## Checks

- `npm run test -w frontend -- src/cardio`: passed
- I added checks for the loading screens of the stats and personal records. They check the region name, the placeholder, the `sr-only` status line, and that it disappears after loading.
- ESLint, Prettier: passed
