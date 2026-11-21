# Journal set keys, timer announcements and draft status text (#382)

## Change

| File                              | Content                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspace/model.ts`              | A set gets a client id `_key` (`withSetKeys`); `withoutSetKeys` strips it before anything is sent. A set copied by "add set" gets its own id.                                                                                              |
| `workspace/use-workout-draft.ts`  | Every editor value passes through `withSetKeys`; the double-tap guard (`completedAt`) is keyed by that id instead of the index; the saved body, its validation and the retry key use the stripped editor, so the server never sees `_key`. |
| `workspace/workout-editor.tsx`    | Set rows use `_key` as React key, so deleting a middle set leaves the others with their own state.                                                                                                                                         |
| `workspace/rest-timer-panels.tsx` | The ticking readout is a `role="timer"` without `aria-live`. A separate polite region (`data-slot="rest-announcement"`, screen-reader only) says "Rest running", "Rest paused" or "Rest ended" when the state changes.                     |
| `app.tsx`                         | After discarding a draft the status reads "Draft discarded".                                                                                                                                                                               |
| `set-completion.test.tsx`         | Deleting the second of three sets keeps the third one completed and its repeat-tap guard; the readout has no `aria-live` and the announcement region does.                                                                                 |

## Checks

- The deletion test fails with the old index-based guard and passes now.
- `npm run check`: passes.
