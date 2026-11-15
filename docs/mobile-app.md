# Mobile app approach decision (PWA, TWA, Capacitor) and Play Store requirements

- Issue: [#108](https://github.com/sirloinbh/workout-memo/issues/108) (parent [#215](https://github.com/sirloinbh/workout-memo/issues/215))
- Checked on: 2026-11-08. Play policies and npm versions change often, so check them again when you start #110 and #111.
- This document is a record of research and decisions. The build procedure and release procedure will be added to this document in #110 and #111.

## Summary

**Recommendation: finish the PWA first (#106, #107, #109), and upload a TWA built with the PWABuilder web service to the Play internal testing track (only me) for the store. Move to Capacitor if Health Connect (#118) or an exact timer notification while the screen is off becomes truly necessary.**

- With a TWA, the app content updates just by deploying the web app, and you do not need to install any npm tools locally. The cost is only the Play registration fee of US$25 (one time) and the domain.
- For all three approaches, **a public HTTPS domain (#106) and login (#107) come first.** On the current `http://<IP>`, not even a service worker can be registered.

## This app's conditions

| Item                        | Current state                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users                       | Just me (1 person)                                                                                                                                                                                      |
| Access                      | `http://<fixed IP>`, limited only by the Lightsail firewall IP allow list ([deployment and operations](deployment.md)). No domain or HTTPS (#106)                                                       |
| Authentication              | None (#107). A phone's IP changes, so the phone cannot connect without login                                                                                                                            |
| PWA files                   | `manifest.webmanifest` (standalone, 192, 512 and maskable icons), `sw.js` (pages go to the network, offline shows a notice, caches only `/assets/`, does not touch `/api/`), `offline.html`, Apple icon |
| Service worker registration | `main.tsx` registers `/sw.js` in a production build, but HTTP+IP is not a secure context, so it is not actually registered                                                                              |
| Important features          | Rest timer end notification and vibration (including when the screen is off), offline use in the gym, and later Garmin and Nike data (Health Connect, #118)                                             |

About offline: the current service worker does not cache pages, so when offline you only see `offline.html`. "Recording offline in the gym" is web-side work that is separate from the choice of approach: an app shell cache and a save queue (draft preservation, #34). All three approaches use the same web code, so this work is reused in any of them.

## Comparison of candidates

| Criterion                          | PWA only                                                                                                                                                                                                                        | TWA (Bubblewrap / PWABuilder)                                                                                                | Capacitor                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How it runs                        | A web app installed by the browser                                                                                                                                                                                              | An Android app that Chrome (or a TWA-capable browser) launches without an address bar                                        | A WebView inside the app + native plugins                                                                                                                                          |
| Prerequisites                      | HTTPS, manifest (name, 192/512 icons, `start_url`, `display`)                                                                                                                                                                   | PWA requirements + `/.well-known/assetlinks.json` (Digital Asset Links). If it fails, a Custom Tab with an address bar shows | Android Studio 2025.2.1 or later, Node 22 or later. If the web assets are bundled in the app, the app itself starts without HTTPS, but the API server needs HTTPS                  |
| Updates by web deploy alone        | Yes                                                                                                                                                                                                                             | Yes (content is loaded from the web). Only the icon, name and package settings need an app update                            | No. The web assets are bundled in the app, so every change needs an app build and a store update. Loading remotely with `server.url` is "not for production" per the official docs |
| Offline                            | Service worker cache (web work)                                                                                                                                                                                                 | Same as PWA (same service worker)                                                                                            | The app shell is included by default. Offline data still has to be built yourself                                                                                                  |
| Timer notification with screen off | Unreliable. For a page hidden for over 5 minutes, chained timers (5 or more levels) that are silent for 30 seconds or more are throttled to once a minute unless WebRTC is used. The scheduled notification API is discontinued | Same as PWA (the web code shows the notification)                                                                            | Can be scheduled with Local Notifications. For an exact time, `SCHEDULE_EXACT_ALARM`; during Doze, `allowWhileIdle` (once per 9 minutes per app)                                   |
| Replace with server Web Push       | Possible (the server pushes at the end time). Needs VAPID, subscription storage and send code                                                                                                                                   | Possible (same way)                                                                                                          | Not needed (local notification)                                                                                                                                                    |
| Health Connect                     | Not possible (no web API)                                                                                                                                                                                                       | Not possible (inside a TWA it is web code)                                                                                   | Possible. But you must write Kotlin native code yourself (Jetpack `connect-client`) or need a community plugin                                                                     |
| iOS                                | Possible. Safari "Add to Home Screen", and Web Push for home screen apps from iOS 16.4                                                                                                                                          | None (Android only)                                                                                                          | Possible. Mac and Xcode 26 or later, Apple Developer Program US$99 per year                                                                                                        |
| Cost                               | Domain                                                                                                                                                                                                                          | Domain + Play US$25 (one time)                                                                                               | Domain + Play US$25 (one time); for iOS, US$99 per year and a Mac                                                                                                                  |
| Maintenance                        | Least                                                                                                                                                                                                                           | Low. Managing the signing key and `assetlinks.json`, and rebuilding when Play's target API level is raised                   | High. Android project, Gradle, plugin versions, and an app release for every web change                                                                                            |
| npm supply chain                   | No new packages                                                                                                                                                                                                                 | The Bubblewrap CLI has many dependencies. With the PWABuilder web service there is no local install                          | 3 to 4 `@capacitor/*` packages stay as dependencies of the app repository                                                                                                          |

## Pros and cons of each candidate

### PWA only

- Pros: No extra tools or cost. It already has a manifest, icons and a service worker, so with just HTTPS it almost meets the install requirements. iOS works with the same code.
- Cons: There is no store listing (it does not fully meet user request 3). There is no way to show a timer notification exactly on the device while the screen is off. Health Connect cannot be used.

### TWA

- Pros: It turns the PWA directly into a store app. A web deploy is an app update, so the current automatic deploy (#75) is used as it is. With the PWABuilder web service you can get the AAB, the signing key and even `assetlinks.json`.
- Cons: The limits for notifications and Health Connect are the same as the PWA. If the Digital Asset Links check fails, the address bar shows. In addition to the upload key fingerprint, the Play App Signing key fingerprint must also go into `assetlinks.json`. It depends on Chrome on the device.

### Capacitor

- Pros: Local scheduled notifications and vibration, Health Connect (native code), and even iOS can be extended from one codebase.
- Cons: The app is not updated by a web deploy alone (a store release for every deploy is a burden for a one-person app). You need to maintain Android Studio and Gradle and track plugin versions. We could not find an official Capacitor plugin for Health Connect, so you would have to write Kotlin yourself or review a community plugin (see "What we could not confirm" below).

## Play Store requirements (checked 2026-11-08)

| Requirement                                | Content                                                                                                                                                                                                                                                     | Source                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration fee                           | **US$25, one time**. It may ask for an ID and a credit card in the legal name. A personal account needs to verify access to an Android device with the Play Console app                                                                                     | [6112435](https://support.google.com/googleplay/android-developer/answer/6112435)                                                                                                              |
| Test requirement for new personal accounts | A personal account created after 2023-11-13 needs **12 testers in a closed test for 14 days in a row** before production. If a tester leaves and rejoins, the count restarts                                                                                | [14151465](https://support.google.com/googleplay/android-developer/answer/14151465)                                                                                                            |
| Internal testing                           | No requirement, **up to 100 testers**, may skip the standard policy and security review, and is deployed within minutes. You can run only internal testing without production                                                                               | [14151465](https://support.google.com/googleplay/android-developer/answer/14151465), [9845334](https://support.google.com/googleplay/android-developer/answer/9845334)                         |
| Privacy policy                             | **Required for every app** (even if it collects no data). Link it in the store listing and in the app. A publicly reachable URL, a valid SSL certificate, no region block or login wall, and no PDF                                                         | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455)                                                                                                              |
| Data safety form                           | Required for apps on the closed test, open test and production tracks. **Apps only on internal testing are exempt**                                                                                                                                         | [10787469](https://support.google.com/googleplay/android-developer/answer/10787469)                                                                                                            |
| Health apps declaration                    | Closed test, open test and production apps submit it even without health features. This app falls under "Activity and Fitness"                                                                                                                              | [14738291](https://support.google.com/googleplay/android-developer/answer/14738291)                                                                                                            |
| Health Connect permissions                 | Give a reason for each permission in the Play Console declaration form and get reviewed. It must fit an allowed use (such as fitness coaching), and the privacy policy must state the handling of health data. The app needs a screen that shows the policy | [12991134](https://support.google.com/googleplay/android-developer/answer/12991134), [get-started](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started) |
| Target API level                           | New apps and updates need **Android 16 (API 36) or higher** (from 2026-08-31, extended to 2026-11-01, which has already passed)                                                                                                                             | [11926878](https://support.google.com/googleplay/android-developer/answer/11926878)                                                                                                            |
| App signing                                | A new app is enrolled in Play App Signing automatically (Google-generated key). The upload key can be reset if lost, and Google keeps the app signing key                                                                                                   | [9842756](https://support.google.com/googleplay/android-developer/answer/9842756)                                                                                                              |

What needs a public HTTPS domain

- Privacy policy URL: it must open without login from anywhere in the world. It cannot sit behind an IP allow list. Put it on a public page of the app's domain (a login exception) or on separate static hosting.
- The TWA's `/.well-known/assetlinks.json`: put it at the domain root over HTTPS. It must open without login.
- The HTTPS in the PWA install requirements.

Health Connect note: it is built into the OS from Android 14, and Android 13 and below need the Health Connect app installed. To read records older than 30 days before the time the permission was granted, `PERMISSION_READ_HEALTH_DATA_HISTORY` is needed separately (this affects importing past Garmin records in #118).

## npm tools and the supply chain

Checked with `npm view` (metadata read only). Reference date 2026-11-08; the 14-day baseline is published before 2026-10-25.

| Package                          | Latest | Published (UTC) | 14 days passed | Choice that fits the 14-day rule                                                           | Notes                                                                                                                  |
| -------------------------------- | ------ | --------------- | -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `@bubblewrap/cli`                | 1.27.0 | 2026-10-09      | Yes (30 days)  | 1.27.0                                                                                     | GoogleChromeLabs. `@bubblewrap/core` 1.27.0 (2026-10-09) pulls in googleapis, jimp, resvg and others. Node 18 or later |
| `@capacitor/core`                | 8.6.0  | 2026-10-28      | No (11 days)   | 8.5.3 (2026-10-07)                                                                         | Only dependency is `tslib`                                                                                             |
| `@capacitor/cli`                 | 8.6.0  | 2026-10-28      | No             | 8.5.3 (2026-10-07)                                                                         | Node 22 or later, 18 direct dependencies including tar, xcode and native-run                                           |
| `@capacitor/android`             | 8.6.0  | 2026-10-28      | No             | 8.5.3 (2026-10-07). 8.6.0 requires core ^8.6.0, so keep the three package versions aligned | The peer of 8.5.3 is `@capacitor/core ^8.5.0`                                                                          |
| `@capacitor/local-notifications` | 8.3.1  | 2026-08-19      | Yes (81 days)  | 8.3.1                                                                                      | peer `@capacitor/core >=8.0.0`                                                                                         |

- The top level of the packages above has no `preinstall`, `install` or `postinstall` scripts. We did not install anything, so we could not check the sub-dependencies.
- If adopted, follow AGENTS.project.md and the [proven repeatable procedure](../skills/workout-foundation/references/procedures.md): confirm the user understands the risk → `npm install --ignore-scripts --save-exact` → check `hasInstallScript` → regenerate the subtree lockfile with `--before=<14 days ago>` → confirm the Docker build. Capacitor stays as a dependency of the app repository.
- Bubblewrap downloads the JDK and the Android SDK on first run (per the official README; we did not run it to confirm). If used, install it at a pinned version in a separate temporary folder instead of the app repository, and use it as a one-off.

### Building without a local install, with the PWABuilder web service

PWABuilder (<https://www.pwabuilder.com>) runs Bubblewrap on a server to build a TWA.

1. Enter the address of the PWA deployed over public HTTPS and choose the Android package (a manifest is required).
2. Enter the package name (for example `kr.sirloinbh.workoutmemo`), the app name and the version, and for the signing key choose "New" (generate a new key).
3. Download the zip: `.aab` (for Play upload), `assetlinks.json`, `signing.keystore`, `signing-key-info.txt` (the key and store passwords, and the alias).
4. After the first upload, add the SHA-256 fingerprint of the app signing key in the Play Console to `assetlinks.json` and deploy it as `/.well-known/assetlinks.json` (because Google re-signs the app).
5. Do not commit `signing.keystore` and `signing-key-info.txt` to the repository; keep them offline, such as in a password manager (the upload key can be reset if lost).

Risk: the upload key is generated by a third-party service. In return, Play App Signing holds the real app signing key and the upload key can be reset, so the impact is limited. If you are uneasy, use the Mine option with a key you created yourself (`keytool`, included in the JDK). Source: [PWABuilder Android docs](https://docs.pwabuilder.com/#/builder/android).

## Recommendation and reasons

**TWA (PWABuilder) + Play internal testing track**, on top of the PWA.

1. This is a one-person app and has automatic deploy (#75), so an approach where a web deploy alone updates the app has the least operating burden (PWA and TWA).
2. The store listing request is met with the TWA. Internal testing has no 12-tester 14-day requirement and is exempt from the data safety form (confirmed). The official wording of the health apps declaration lists closed test, open test and production as target tracks and not internal testing, but there is no explicit statement that it is exempt (see "What we could not confirm" below).
3. You do not have to bring npm tools onto the local machine (PWABuilder). Even if you do, `@bubblewrap/cli` 1.27.0 meets the 14-day rule.
4. Rest timer: while the screen is on, handle it on the web as now, and for screen-off choose between (a) a notification at the end time through server Web Push or (b) a Capacitor local notification. (a) works for the PWA, the TWA and an iOS home screen app with the same web code.

Reasons for rejecting or deferring

- **PWA only**: There is no store listing. But since it is the base of the TWA, we do not discard it; we finish it first.
- **Capacitor (deferred)**: It is not updated by a web deploy alone, and maintaining the Android project and the npm dependencies are a continuing cost. For Health Connect too, we could not confirm an official plugin, so Kotlin work may be needed. Reopen it when #118 picks the Health Connect path, or when server Web Push is not enough for screen-off notifications. Even if we move from the TWA, the web code, the package name and the Play listing are reused (an app update with the same package name).

## Order of prerequisites

```text
#106 domain and HTTPS ─┬─> #107 login (Secure cookie) ─┐
                       └─> #109 PWA install check ─────┴─> #110 TWA package, signing, real device ─> #111 Play listing (internal testing)
(#118 Health Connect decision) ─ if needed ─> Capacitor switch issue (to be created)
```

- #106 is the start of everything. The service worker, installation, `assetlinks.json` and the privacy policy URL all require HTTPS.
- #107 is the prerequisite for phone access (changing IP) and for opening firewall port 443. Keep the public paths (`/.well-known/assetlinks.json` and the privacy policy page) as login exceptions.
- #109 can be done right after #106. It can run in parallel with #107.
- #110 can verify the real-device scenarios (staying logged in and so on) only after #106, #107 and #109 are done.
- #111 needs the AAB from #110 and the privacy policy page. The user creates the Play account and pays.

## Decision (user decision, 2026-11-08)

| Item                    | Decision                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Approach                | Finish the PWA first (#106 → #107 → #109), and upload a TWA built with the PWABuilder web service to the Play internal testing track (only me) |
| Store audience          | Internal testing for me only. No general release                                                                                               |
| iOS                     | Not needed                                                                                                                                     |
| Screen-off notification | Server Web Push (#260)                                                                                                                         |
| Health Connect          | Decide after the conclusion of #118. If needed then, review Capacitor again                                                                    |
| Cost                    | Accept the annual domain cost and the one-time Play registration fee of US$25                                                                  |
| Build tool              | PWABuilder web service. Do not install an npm build tool locally                                                                               |

What the user does directly: buy the domain and connect DNS (#106), and create the Play Console developer account, verify the device and pay the registration fee (#111).

## Items for the user to decide

These are the options presented before the decision. The decision is in the section above.

1. **Store audience**: internal testing for me only (recommended: no tester requirement or data safety form; the health apps declaration has no explicit exemption and might be required, see "What we could not confirm") / general release (closed test with 12 testers for 14 days, data safety form, health apps declaration, review needed).
2. **Whether iOS is needed**: not needed (recommended) / an iOS home screen PWA is enough / App Store listing (Mac, Xcode, US$99 per year, Capacitor needed).
3. **Screen-off notification level**: notify only while the screen is on / end-of-timer notification with server Web Push (recommended; a delay of a few seconds is possible) / exact local notification (Capacitor).
4. **When to do Health Connect**: decide after the conclusion of #118 (recommended) / start with Capacitor from now.
5. **Cost**: the annual domain cost (#106) + Play US$25 (one time). An iOS store adds US$99 per year.
6. **Build tool**: PWABuilder web service (recommended: no local install, and the service generates the upload key) / a local install of `@bubblewrap/cli@1.27.0` (needs confirmation that the user understands the npm risk) / a key you made yourself + PWABuilder "Mine".

## Proposed scope of follow-up issues

- **#109 PWA install support**: the issue body's "no manifest, icons or service worker" is already resolved (central template sync). The remaining scope is: Chrome's installability judgment over HTTPS and a Lighthouse record, install and full screen on a real Android device, checking that a new version is picked up, deciding whether to do the offline app shell cache and the save-failure display (linked to #34), and deciding whether to do the server Web Push rest notification here or split it into a separate issue. Do not use `vite-plugin-pwa`; keep the current hand-written `sw.js` (no new npm).
- **#110 Android package**: confirmed as a TWA (PWABuilder). Package name, upload key creation and storage, deploying `/.well-known/assetlinks.json` (a login exception, with both the upload key and app signing key fingerprints), confirming target API 36 or higher, and real-device scenarios (staying logged in, saving a log, the rest timer, the back button, and a web deploy being reflected). Install through the Play internal test instead of a direct APK install.
- **#111 Play listing**: we propose limiting the scope to the internal testing track. Account registration (US$25, device verification), a public privacy policy page, a minimal store listing, and the health apps declaration (submit together if it is also required for internal testing). If general release is chosen, add the closed test (12 testers, 14 days), the data safety form, the health apps declaration ("Activity and Fitness") and the content rating.
- **New issues (deferred)**: screen-off rest notification (server Web Push), and the Capacitor switch and Health Connect integration (depending on the result of #118).

## What we could not confirm

- Whether, when using only the internal testing track, the Play Console requires the "App content" items such as the privacy policy and content rating before the first deploy. We confirmed only the data safety form exemption from the official docs. The health apps declaration page lists only closed, open and production as target tracks, so internal testing seems to be left out, but there is no explicit wording.
- How a web notification inside a TWA is handed over to an app notification (notification delegation) and how Android 13's notification permission is handled. The related Chrome doc address returned 404.
- The delay with which a server Web Push arrives while the screen is off or in Doze, and whether the `vibrate` option of `showNotification` actually vibrates on the Android 8 and later notification channels. We will check it in the real-device verification (#110).
- Whether a community Capacitor plugin for Health Connect exists, its maintenance state and version, and whether an official plugin exists (not checked this time).
- Bubblewrap's automatic download of the JDK and Android SDK and the number of sub-dependencies (not installed).
- Whether Digital Asset Links verification fetches the file directly from the device or goes through Google's servers. Either way, there is no problem if `/.well-known/assetlinks.json` is public with no IP restriction.
- The countries and timing where Google's Android developer verification (identity verification for APK installs outside Play too) applies. We expect no impact if we install through Play internal testing, but we have not checked.

## Source links

- Google Play
  - [Registering a developer account](https://support.google.com/googleplay/android-developer/answer/6112435)
  - [Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
  - [Setting up internal, closed and open tests](https://support.google.com/googleplay/android-developer/answer/9845334)
  - [Privacy policy and app content](https://support.google.com/googleplay/android-developer/answer/9859455)
  - [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
  - [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291)
  - [Health Connect permissions policy](https://support.google.com/googleplay/android-developer/answer/12991134)
  - [Target API level requirement](https://support.google.com/googleplay/android-developer/answer/11926878)
  - [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- Android, Chrome and the web
  - [Get started with Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started)
  - [Trusted Web Activity overview](https://developer.chrome.com/docs/android/trusted-web-activity/overview)
  - [TWA integration guide (assetlinks.json)](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide)
  - [Chrome 88 timer throttling (once a minute under conditions)](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)
  - [Notification Triggers API discontinued](https://developer.chrome.com/docs/web-platform/notification-triggers)
  - [PWA install criteria](https://web.dev/articles/install-criteria)
- Capacitor
  - [Environment setup (Node 22, Android Studio 2025.2.1, Xcode 26)](https://capacitorjs.com/docs/getting-started/environment-setup)
  - [Configuration `server.url` (not for production)](https://capacitorjs.com/docs/config)
  - [Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- Apple
  - [Apple Developer Program (US$99 per year)](https://developer.apple.com/programs/)
  - [Compare memberships (free account limits)](https://developer.apple.com/support/compare-memberships/)
  - [Web Push for web apps on iOS 16.4 home screen (WebKit)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- PWABuilder and npm
  - [PWABuilder Android package](https://docs.pwabuilder.com/#/builder/android)
  - [@bubblewrap/cli](https://www.npmjs.com/package/@bubblewrap/cli), [@capacitor/core](https://www.npmjs.com/package/@capacitor/core), [@capacitor/cli](https://www.npmjs.com/package/@capacitor/cli), [@capacitor/android](https://www.npmjs.com/package/@capacitor/android), [@capacitor/local-notifications](https://www.npmjs.com/package/@capacitor/local-notifications)
