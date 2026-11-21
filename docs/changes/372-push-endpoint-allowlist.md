# Accept push subscriptions only from known push services (#372)

## Change

- `shared/contract.ts`: the push subscription and unsubscribe endpoint must be an `https` address on `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, or `*.notify.windows.com`. Ports, user info, and look-alike hosts (`fcm.googleapis.com.evil.example`) are rejected, so the server can no longer be made to POST to an internal address. `backend/src/contract.ts` is regenerated with `npm run contract:sync`; `docs/openapi.json` is unchanged in shape.
- The error message is now "The push endpoint must be an https address of a known push service".

## Tests

- `backend/test/web-push.test.ts`: `https://internal.example/`, look-alike hosts, a port, and user info get 400; FCM, Mozilla, Apple, and Windows endpoints are accepted.

Merging this deploys to production. Subscriptions already stored from other hosts are not removed; they simply keep failing to send if unreachable.
