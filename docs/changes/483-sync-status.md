# Show which workout logs are waiting to sync and let me retry a failed sync (#483)

Follows #476. Logs that are only on the phone are now visible, and a save the server rejected can be retried.

## Change

| File                                             | Content                                                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/offline/sync-status.tsx`           | `SyncBadge` (count in the app shell: "N waiting to sync", "N not saved"); one "Waiting to sync" line per queued log; Retry and Discard on a rejected save |
| `frontend/src/offline/use-offline-sync.ts`       | `retry(key)`: clears the entry's error and sends the queue again                                                                                          |
| `frontend/src/app.tsx`                           | Puts the badge in the shell `actions` slot next to the account actions (the managed `AppShell` is not edited)                                             |
| `frontend/src/offline/sync-status.test.tsx`      | Status mark, count, empty state, retry and discard buttons                                                                                                |
| `frontend/src/offline/use-offline-sync.test.tsx` | Retry resends a rejected save and empties the queue; discard removes it                                                                                   |

## Notes

- A queued log is not in the server list, so its mark is a line above the page content on every screen, not a badge on a list row.
- The status renders nothing with an empty queue, so existing screens, axe and visual baselines do not change.

## Checks

See the PR for the results of `npm run check`.

- `npm run check`: passed. Vitest `src/offline`: 11 passed.
- `e2e/offline-save.spec.ts` now also runs axe on the waiting list and the shell badge at 390 and 1280 px and checks there is no horizontal overflow: passed locally (port 3201 is unusable on this PC, so it ran on 3291/5391 with a throwaway config); CI runs the real jobs.
