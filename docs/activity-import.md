# Research on ways to import external running records (#118)

Research date: 2026-11-08. Scope: Garmin (Garmin Connect), Nike Run Club (NRC), relaying through Strava, and Android Health Connect.
This app is a personal web app for one person (a Lightsail server behind an IP allow list), and cardio records store only summary values (#114 `cardio_sessions`, no laps or GPS).

**Summary of the recommendation:** (1) Build file import (#119) first. Read TCX and GPX in the browser with `DOMParser` without a new package, and handle FIT according to the user's decision. (2) Garmin automatic sync (#121) can go ahead with the **Garmin Personal API**, which became public in 2026. It is the official path where you read only your own data with your own key, with no application or approval. But first check the endpoints, the request limits, and the range of past data in the Swagger docs. (3) NRC (#120) has no official API. Hold it until the format of the personal data request file is confirmed, and if an automatic path is really needed, read it with the Strava API (single-user mode) after the official NRC → Strava integration. (4) Health Connect needs a separate Android app, so do not use it if the Garmin Personal API is enough.

"Could not confirm" means content that this research could not confirm from an official source. Check it again before implementing.

## 1. Garmin

### 1.1 Official API tiers

- The Garmin Connect Developer Program has the Personal, Business (Starter), and Enterprise tiers. Business supports the push method where Garmin sends data, and Enterprise supports push, ping/pull, and past records older than 1 month. The price is not on a public page (could not confirm). — [overview](https://developer.garmin.com/gc-developer-program/overview)
- The Business tier (Activity API) gives summary JSON or FIT, and details are received as FIT, GPX, or TCX. — [activity-api](https://developer.garmin.com/gc-developer-program/enterprise/activity-api)
- There are reports (secondary sources) that new Business applications stopped in the spring of 2026, and that a terms change in October 2026 banned passing data to services that Garmin has not approved. — [the5krunner September](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/), [the5krunner October](https://the5krunner.com/2026/10/14/garmin-api-intervals-third-party-apps/)

### 1.2 Personal API (the path that fits this app)

- It is a feature that lets a customer read their own Garmin Connect data through an API: "allows Garmin customers to securely access their own Garmin Connect data using an API". Commercial apps for many users are not its target: "not intended for commercial applications serving multiple end users". — [personal-faq](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- Getting a key is self-service. You create it on the Personal API Key screen of the Garmin Connect website and agree to the terms, and the key is shown only once when it is created. You choose the expiry from 30, 90, 180 days, or 1 year, and an email arrives about 1 week before it expires. — [personal-api](https://developer.garmin.com/gc-developer-program/personal/personal-api), [personal-faq](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- Authentication: call `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with the key (header `Authorization: ApiKey …`) to get an OAuth2 access token. The token is valid for 24 hours (or until the key expires, whichever comes first), and there is no refresh token, so you get a new one. — same FAQ
- Could not confirm: the list of endpoints, the formats you receive (summary JSON, FIT), the request limits, the range of past records, and the cost. They must be checked in the [Swagger docs](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) that the FAQ points to. There is also a report that it is not public whether the FIT received through the API is the same as the original ([the5krunner](https://the5krunner.com/2026/10/22/garmin-personal-api/)).
- When applying it to this app: the user creates the key and keeps it in a server environment variable (or the server secret store) and does not commit it. The token is fetched again every 24 hours, and a server job reads recent activities on a fixed schedule (see the "Common" section below) and stores them with `source='garmin'` and `external_id=activity ID` (using the source and external ID duplicate prevention of #114 as it is). The key must be created again before it expires (1 year at most).

### 1.3 The user exports by hand

- One activity: from the menu of the activity screen you get the original (FIT, zip), TCX, or GPX. I could not confirm an official help page, and the basis is a community post. — [Garmin forum](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/166824/)
- The whole account: if you make a [data request](https://support.garmin.com/customerDataRequestApp/en-US/initiateRequest/), a zip link arrives by email, and the activities are said to be in `DI_CONNECT/DI-Connect-Fitness-Uploaded-Files` in the original format. The path and the wait time (a few hours to 48 hours) are forum reports, so could not confirm. — [Garmin forum](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/407936/export-data)

### 1.4 Do not use unofficial libraries

- Libraries such as `garminconnect` and `garth` use web endpoints that are not public. The developer terms ban collection by robot, spider, or scraping ([Developer Program Agreement](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf)), and there are reports that non-browser clients are blocked ([Garmin forum](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/433892/)). Now that the Personal API exists, there is no reason to use them.

## 2. Nike Run Club

- There is no public API. There are only secondary reports that it was closed in 2016, and I could not confirm an official Nike notice. — [Smashrun blog](https://blog.smashrun.com/2016/09/29/nike-api-issues/)
- Request your own data: "Request Data" under Account Settings > Privacy, or a web form. — [Nike privacy help](https://www.nike.com/help/privacy). The format, the time it takes, and the content are only from third-party guides, so could not confirm ([takeoutday](https://takeoutday.org/guides/how-to-export-nike-run-club-data)). **If the user makes one request and we look at the real file, we can decide the scope of #120.**
- Unofficial methods (calling the undocumented `api.nike.com` with a web token, [example](https://gist.github.com/niw/858c1ecaef89858893681e46db63db66)) are not used because the Nike terms of use ban unapproved automation, scraping, and reverse engineering. — [Nike Terms of Use](https://agreementservice.svs.nike.com/rest/agreement/termsOfUse/en/ZA/default/redirect/true)
- Going around it with official integrations
  - Connect with Garmin, COROS, Strava, and others in NRC Settings > Partners. — [Nike help](https://www.nike.com/de/help/a/nrc-partner-apps-und-geraete-verbinden). Could not confirm whether records go from NRC to Garmin.
  - The official NRC → Strava integration (started in 2023, only activities recorded after connecting). — [press release](https://insider.fitt.co/press-release/strava-launches-nike-run-club-and-nike-training-club-integration-available-today/), [Nike newsroom](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)
  - NRC → Apple Health, one direction only. — [Nike help](https://www.nike.com/help/a/connect-nrc-health-app). I could not confirm official documentation for NRC → Health Connect.

## 3. Relaying through Strava

- Registering an app is self-service, and a new app starts in "Single Player Mode" (one user, the developer themselves). The default call limits are 200 per 15 minutes and 2,000 per day overall (100 per 15 minutes and 1,000 per day for non-upload requests). — [rate-limits](https://developers.strava.com/docs/rate-limits/)
- To read even private activities you need the `activity:read_all` scope. It reads the activity summary, laps, and streams, but I could not find an endpoint that downloads the original file (FIT) of a recorded activity (only part of the docs was checked). — [API reference](https://developers.strava.com/docs/reference/)
- API terms (in effect from 2026-06-01): a user's data is shown only to that user, and one token is used for one app only. It is free now and may become paid after prior notice. — [Strava API Agreement](https://www.strava.com/legal/api)
- Use: it is the only official path to import NRC records automatically (NRC → Strava → this app). For Garmin, the Personal API is more direct.

## 4. Android Health Connect

- The data stays only on the device and is not uploaded to the Google cloud. A web app cannot read it, and an Android app that uses the Jetpack SDK is needed. — [Android help](https://support.google.com/android/answer/13770320), [Health Connect guide](https://developer.android.com/health-and-fitness/guides/health-connect)
- Related data: `ExerciseSessionRecord` (exercise type, segments, laps), `DistanceRecord`, `HeartRateRecord`, `TotalCaloriesBurnedRecord`, `ElevationGainedRecord`, `StepsCadenceRecord`, `CyclingPedalingCadenceRecord`, and so on. — [data-types](https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types)
- Records older than 30 days from when permission was first granted can be read only with the `READ_HEALTH_DATA_HISTORY` (`PERMISSION_READ_HEALTH_DATA_HISTORY`) permission. If you reinstall the app, the baseline is reset. — [read-data](https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data)
- Garmin → Health Connect exercise session sync has only secondary sources (the official FAQ does not open), and I could not confirm official documentation for NRC either. — [Sonar Health](https://www.sonarhealth.co/blog/sync-health-connect-to-garmin/)
- The [mobile app decision (#108)](mobile-app.md) is to do the PWA and TWA first and move to Capacitor only if Health Connect is really needed. If the Garmin Personal API is enough, this path is not needed.

## 5. File formats and how they map to this app's model

### 5.1 Formats

- **FIT**: the required messages of an Activity file are File Id, Activity, Session, Lap, and Record. Every summary message has Start Time, Total Elapsed Time (including pauses), and Total Timer Time (excluding pauses), and the sum of the time and distance of the Laps must equal the Session. The time zone comes from the Local Timestamp of the Activity message. — [FIT Activity file](https://developer.garmin.com/fit/articles/file-types/activity.html), [FIT protocol](https://developer.garmin.com/fit/protocol/). Recheck the field numbers and scales (for example, time is stored multiplied by 1000) against the official Profile (community mirror: [ext_fit](https://hexdocs.pm/ext_fit/ExtFit.Profile.Messages.Session.html)).
- **TCX**: [TrainingCenterDatabase v2 schema](https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd). `Activity/@Sport` has only three values: Running, Biking, and Other. Each Lap has `StartTime`, `TotalTimeSeconds`, `DistanceMeters`, `Calories`, `AverageHeartRateBpm`, `MaximumHeartRateBpm`, and `Cadence`, and there is no elevation gain summary.
- **GPX**: it has no summary fields, only track points. Heart rate and cadence come in only through the Garmin [TrackPointExtension](https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd). Time and distance must be calculated from the points. — [GPX 1.1](https://www.topografix.com/GPX/1/1/)

### 5.2 Mapping to `cardio_sessions`

| `cardio_sessions`            | FIT session                                           | TCX                                               | Health Connect                                      |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| `date`, `start_time` (Seoul) | `start_time` (UTC) + Activity `local_timestamp`       | First `Lap/@StartTime` (UTC)                      | `startTime` + `startZoneOffset`                     |
| `kind`                       | `sport`/`sub_sport`                                   | `Activity/@Sport` (3 kinds)                       | `exerciseType`                                      |
| `duration_sec`               | `total_timer_time` (to decide: one of it and elapsed) | Sum of Lap `TotalTimeSeconds`                     | `endTime − startTime` (adjusted by segments)        |
| `distance_km`                | `total_distance` (m)                                  | Sum of Lap `DistanceMeters`                       | Sum of `DistanceRecord`                             |
| `avg_heart_rate`             | `avg_heart_rate`                                      | Lap `AverageHeartRateBpm` (time-weighted average) | Average of `HeartRateRecord`                        |
| `max_heart_rate`             | `max_heart_rate`                                      | Maximum of Lap `MaximumHeartRateBpm`              | Maximum                                             |
| `calories_kcal`              | `total_calories`                                      | Sum of Lap `Calories`                             | `TotalCaloriesBurnedRecord`                         |
| `elevation_gain_m`           | `total_ascent` (to confirm)                           | None (calculate from track points or leave empty) | `ElevationGainedRecord`                             |
| `avg_cadence`                | `avg_cadence`/`avg_running_cadence` (unit to confirm) | Lap `Cadence`                                     | `StepsCadenceRecord`/`CyclingPedalingCadenceRecord` |
| `effort`                     | Could not confirm a standard field                    | None                                              | None                                                |
| `source`, `external_id`      | `file` or `garmin` / Garmin activity ID               | `file` / `Activity/Id`                            | Source app / `metadata.id`                          |
| `memo`                       | None                                                  | `Notes`                                           | `notes`, `title`                                    |

Values that are thrown away: laps, lengths, segments, the GPS route, per-second streams (heart rate, speed, elevation), pace splits, power, running dynamics, swimming stroke type and strokes, Training Effect, VO2max, recovery time, and device information.

### 5.3 When laps (`cardio_laps`) are added later

- A FIT `lap` message has, for each lap, the same summary fields as a session (start time, elapsed and timer time, distance, average and maximum heart rate, calories, elevation gain, cadence). There is a rule that the lap totals must equal the session, which can be used for validation.
- A TCX `Lap` has the same summary too, and has `Intensity` (Active, Resting) and `TriggerMethod` (Manual, Distance, Time, and so on) that can be used to tell intervals apart.
- Health Connect `ExerciseSessionRecord.laps` has only the start and end time and the length, so the rest must be gathered from other records by time range.

## 6. Reading FIT and ZIP

- The official [Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk) (`@garmin/fitsdk`): it is in a Garmin repository, supports Node.js and browsers, and groups messages by kind. I could not confirm the license type, the number of dependencies, the size, or the latest version (npm access returned 403). It must be checked before installing.
- A minimal implementation by hand: it has to handle the header, definition and data messages (including compressed timestamps and developer fields), and CRC-16, and move over the table of session and lap field numbers and scales. I estimate roughly 300 to 600 lines, and moving the field table over accurately is the real cost. — [FIT protocol](https://developer.garmin.com/fit/protocol/)
- ZIP (the Garmin original export, the whole-account export): the browser's `DecompressionStream` handles only gzip, deflate, and deflate-raw, and the ZIP directory has to be parsed by hand. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream). [fflate](https://github.com/101arrowz/fflate) is MIT and pure JS, and about 3 kB if you use only decompression (could not confirm zero runtime dependencies).

## 7. Summary by path

| Path                           | Possible?                                                      | Cost              | Main constraints                                                                                               |
| ------------------------------ | -------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| File upload (TCX, GPX)         | Possible, no new package                                       | Free              | Manual, and GPX has no summary values so they must be calculated                                               |
| File upload (FIT)              | Possible, with a package or a hand implementation              | Free              | Package install approval or implementation cost                                                                |
| Garmin Personal API            | Possible (own data)                                            | Could not confirm | Key reissued at least every year, token 24 hours, limits, range of past data, and formats need checking        |
| Garmin Business API            | Practically not possible (reports of new applications stopped) | Could not confirm | Approval and terms                                                                                             |
| NRC data request file          | Possible (format needs checking)                               | Free              | Manual, wait time                                                                                              |
| NRC → Strava → Strava API      | Possible (official)                                            | Free now          | Only records after connecting, no original file, terms                                                         |
| NRC and Garmin unofficial APIs | Not used                                                       | —                 | Terms violation, unstable                                                                                      |
| Health Connect                 | Needs an Android app                                           | Development cost  | Only on the device, records older than 30 days before granting need a separate permission, #108 Capacitor move |

## 7-1. Common: duplicates, tokens, personal information, schedule

- **The same record from different sources**: the same run can come in twice, as a file (`file`) and through the Personal API (`garmin`) or via Strava (`nike`). The source + external ID duplicate check (#114) alone does not stop it, so every import path shows "an existing record with the same date, a start time within ±2 minutes, and a distance within ±1% (or, if there is no distance, a time within ±1%)" as a duplicate candidate and skips it by default (using the #119 preview rule for all of them).
- **Keeping tokens and keys**: the Garmin Personal API key and the Strava refresh token stay only on the server and are not committed to the repo. Keep them in an environment variable or a server secret file (permission 600), and if they must go in the DB, encrypt them with a server secret key. Do not put them on screens, in logs, or in backup files. For the Garmin key, a notice by email and in the app tells you to renew it 1 week before it expires (1 year at most).
- **Original files and personal information**: the uploaded or downloaded FIT, TCX, GPX, and ZIP files are not stored after the summary values are taken (a GPS route contains the home location). Prefer reading in the browser, like the InBody photo.
- **Sync schedule**: proposed as twice a day (for example 06:00 and 22:00 Seoul time) and a "Import now" button on the screen. Adjust it after checking the Personal API limits. For Strava, the same schedule is fine within the single-user mode limit (200 per 15 minutes).

## 8. Proposed scope of the follow-up issues

- **#119 File import**: build TCX and GPX with `DOMParser` first, and FIT and ZIP follow the decisions below. The preview, duplicates (source + external ID, or start time + distance), and the save flow are as the issue scopes them. Laps are thrown away (#114 decision).
- **#121 Garmin automatic sync**: change scope A (Developer Program approval) to the **Garmin Personal API**. Instead of an OAuth connection, the key the user created is kept on the server, and we build the periodic query, duplicate prevention, and the key expiry notice. Before starting, check the endpoints, formats, and limits in Swagger.
- **#120 NRC**: hold it until the user requests their own data and the file format is checked. If an automatic path is wanted, change the scope to the Strava API (single-user mode) after the NRC → Strava integration. When received through Strava, keep `source` as `nike`, the service that originally recorded it, and use the Strava activity ID as `external_id` (there is no `strava` value in `source` now, `015_cardio_sessions.sql`). Keeping `strava` separately needs a migration (decision item 7).

## 9. Items for the user to decide

1. Whether to do the Garmin automatic sync with the Personal API (the user creates the key, keeps it only on the server, and renews it every year).
2. Reading FIT: install the official `@garmin/fitsdk` (install after checking the license and dependencies, with install approval) or a hand implementation that reads only session and lap.
3. ZIP support: install `fflate`, or have the user unzip it by hand and upload only the files.
4. NRC: choose among checking the format with a personal data request, the NRC → Strava integration path, or hold or drop it.
5. Record time basis: FIT `total_timer_time` (excluding pauses, recommended) or `total_elapsed_time` (including pauses).
6. Health Connect: do not use it for now, and decide again after seeing whether the Garmin Personal API is enough (recommended).
7. The `source` of NRC records received through Strava: leave it as `nike` (recommended, no migration) or add a new `strava` value.
8. The criteria for judging duplicates across different sources (the proposal of a start time within ±2 minutes and a distance within ±1% in section 7-1) and the sync schedule (twice a day + manual).

## 10. User decisions (2026-11-08)

| Item                        | Decision                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Garmin automatic sync    | Garmin Personal API. The user creates the key, keeps it only on the server, and renews it every year (#121)                                                                                                  |
| 2. Reading FIT              | Install `@garmin/fitsdk`. Install after checking the license and dependencies, and the user runs the install command (#119)                                                                                  |
| 3. ZIP                      | Install `fflate`. Same conditions (#119)                                                                                                                                                                     |
| 4. NRC                      | Hold #120 until the user requests their own data and checks the format                                                                                                                                       |
| 5. Record time              | FIT `total_timer_time` (excluding pauses). For TCX, the sum of Lap `TotalTimeSeconds`                                                                                                                        |
| 6. Health Connect           | On hold                                                                                                                                                                                                      |
| 7. Source of NRC via Strava | Keep `source` as `nike` (no migration), and `external_id` is the Strava activity ID                                                                                                                          |
| 8. Duplicates and schedule  | Even from different sources, the same date, a start time within ±2 minutes, and a distance within ±1% (a time within ±1% if there is no distance) is a duplicate candidate. Sync twice a day + manual import |
