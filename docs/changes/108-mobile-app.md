# #108 Decide the mobile app approach and research Play Store requirements

- Issue: [#108](https://github.com/sirloinbh/workout-memo/issues/108)
- Branch: `docs/108-mobile-app`
- Result document: [mobile-app.md](../mobile-app.md)

## Purpose

Decide how to use the web app as a phone app and publish it on the Play Store (PWA only, TWA, or Capacitor), and leave the basis for setting the scope of the follow-up issues #109, #110, and #111. Code and dependencies were not changed.

## What was researched

- The preconditions of the three approaches (HTTPS, Digital Asset Links, install conditions), whether web deploys alone update them, offline, screen-off notifications and vibration, Health Connect, iOS, cost, and maintenance.
- Play requirements: registration fee, the closed testing requirement for new personal accounts, internal testing, the privacy policy, the data safety form, the health app declaration, the Health Connect permission policy, the target API level, and Play App Signing.
- npm metadata (`npm view`, no install): version, publish date, dependencies, and install scripts of `@bubblewrap/cli`, `@bubblewrap/core`, `@capacitor/core`, `cli`, and `android`, and `@capacitor/local-notifications` (`@capacitor/ios` was left out of the table because the recommendation does not do iOS).
- The current PWA files of this app (`manifest.webmanifest`, `sw.js`, `offline.html`, `index.html`, the registration code in `main.tsx`) and [deployment and operation](../deployment.md).

## Summary of results

- Recommendation: finish the PWA, then register a TWA built with PWABuilder on the Play internal testing track (only the user). Defer Capacitor until Health Connect or exact local notifications are needed.
- Confirmed facts: a service worker is not registered over HTTP with an IP address. `@capacitor/*` 8.6.0 was published 11 days ago, so under the 14-day rule 8.5.3 is the candidate. Items that could not be confirmed are in "What could not be confirmed" of the result document.
- Date the sources were checked: 2026-11-08 (Play Console help, developer.android.com, developer.chrome.com, web.dev, capacitorjs.com, developer.apple.com, webkit.org, PWABuilder docs, the npm registry).

## Verification

- `node_modules/.bin/prettier --write`, then `node_modules/.bin/prettier --check docs/mobile-app.md docs/changes/108-mobile-app.md`
- `npm run test:docs`
- Result: prettier `--check` passes, `test:docs` 3 pass

## Change — review follow-up

- The review rechecked the key facts against official sources (registration fee, 12 people and 14 days, internal testing, privacy policy, data safety exemption, target API 36, Play App Signing, Health Connect, Chrome timer throttling, iOS Web Push, Capacitor `server.url` and tooling requirements, npm versions and publish dates).
- (Required) The recommendation section stated for certain that "internal testing does not need the health app declaration", but the official wording has no explicit exemption, so it was lowered to "not in the target track, but no explicit exemption". The only explicit exemption is the data safety form.
- (Optional) For `assetlinks.json`, unified the wording to "add" the Play App Signing key fingerprint together with the upload key fingerprint, added the conditions of Chrome timer throttling (hidden for more than 5 minutes, chain of 5 or more levels, silent for 30 seconds or more, no WebRTC), explained `@capacitor/ios`, which is not in the table, in the research list, and wrote `prettier --check` in the verification commands
- Second review: no required follow-ups. 3 optional items applied: fixed the `assetlinks.json` sentence that broke during editing, aligned the health app declaration wording in the decision items and the #111 scope with "no explicit exemption", and wrote the timer throttling condition accurately up to "silent for 30 seconds or more" (including the link title).

## Change — apply the user's decision

- Wrote the user's decision of 2026-11-08 in the "Decision" section of `docs/mobile-app.md`. The decision is PWA first, then a TWA built with the PWABuilder web service on Play internal testing (only the user), no iOS needed, screen-off notifications through server Web Push, Health Connect after #118, and accepting the domain and Play costs.
- Created #260 (server Web Push when the rest timer ends) under #215 as a follow-up issue. Wrote the things the user must do directly (buying a domain, creating a Play account) in #106 and #111 and added `needs-user`.
