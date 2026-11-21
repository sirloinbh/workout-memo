# Order the rest-timer sync calls (#370)

`syncRest` sent its PUT or DELETE without waiting for earlier calls. A quick start then pause could apply the PUT after the DELETE, and the server would push for a paused rest.

## Change

| File                         | Content                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/push.ts`       | `syncRest` queues its calls: each one starts after the previous one has finished (success or failure). The caller still gets its own call's result or error.        |
| `frontend/src/push.test.tsx` | A slow PUT followed by a pause: the DELETE is not sent until the PUT is done, and the server ends with nothing scheduled. A failed call does not block later calls. |

## Checks

- The ordering test fails against the old `syncRest` and passes now.
- `npm run check`: passes.
