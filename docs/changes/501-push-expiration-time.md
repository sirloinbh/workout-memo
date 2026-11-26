# Accept expirationTime when saving a push subscription (#501)

Right after the VAPID keys were set in production (2026-11-26), turning on notifications showed `Unrecognized key: "expirationTime"`. Browsers return `{ endpoint, expirationTime, keys }` from `PushSubscription.toJSON()`, and the strict subscription schema only allowed `endpoint` and `keys`, so no device could subscribe. The tests used a hand-made subscription without the field.

## Change

| File                                                  | Content                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `shared/contract.ts` (+ generated `backend/src` copy) | `pushSubscriptionSchema` accepts an optional `expirationTime` (number or `null`); not stored |
| `docs/api.md`, `docs/openapi.json`                    | Request body shows the field                                                                 |
| `backend/test/web-push.test.ts`                       | `null` and a number answer 201, a string answers 400, an unknown key still answers 400       |
| `frontend/src/push.test.tsx`                          | The fake subscription now has the browser's shape (`expirationTime: null`)                   |

## Verification

- `npm run check`: see the PR.
- After the deploy: turn on rest notifications in Settings in the real app.
