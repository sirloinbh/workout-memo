# #110 TWA groundwork: assetlinks.json, PWABuilder check, build guide

- Issue: [#110](https://github.com/sirloinbh/workout-memo/issues/110) (stays open: the build and the device checks are the user's)
- Branch: `feat/110-twa-groundwork`

## Decisions (user, 2026-11-18, recorded in the issue)

- Package `kr.sirloinbh.workoutmemo`, Play App Signing on, built with the PWABuilder web service.

## Changes

- `frontend/public/.well-known/assetlinks.json` (new): `[]` until fingerprints exist. Vite copies `public/` into the build and nginx serves it as a static file with `application/json`. The sign-in guards only `/api`, so no sign-in exemption or nginx change was needed. `frontend/nginx.conf` is centrally managed and was not touched.
- Configuration is the committed file itself (fingerprints are public). No env var and no API route, so `docs/api.md` and OpenAPI are unchanged.
- `docs/mobile-app.md`: new "TWA build guide" section (PWABuilder options, keeping the keystore offline, fingerprint, deploy, Play app signing key, APK install, real-device checklist including #260).
- PWABuilder readiness: manifest, icons, `start_url`, `scope`, `display`, `theme_color` and the service worker already meet it. Optional `id`, `screenshots`, `categories` are missing; the manifest is centrally managed, so unchanged.

## Tests

- `frontend/src/assetlinks.test.ts` (new): array JSON, package name, relation and fingerprint format of every statement, and that nginx has no rule that would catch `/.well-known/`.

## Not verified

- The deployed response over HTTPS and its `Content-Type` (no Docker run here), and whether the shared proxy in another repo passes `/.well-known/` through.
- Production access is limited to allowed IPs; Google may not be able to fetch the file. If so, the fix is in `sirloinbh/shared-aws-infrastructure`.
