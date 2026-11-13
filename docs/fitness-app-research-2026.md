# Fitness logging service research and implementation backlog

Research reference date: **2026-10-15 (Asia/Seoul)**

Documentation work: [#30](https://github.com/sirloinbh/workout-memo/issues/30)

## Research basis and limits

We looked first at the official sites, help pages and developer app store descriptions of the 13 specified services. For recent trends and user complaints we used 2025 to 2026 material. Evergreen feature descriptions with no publication date and old help pages are used as current public material, and we do not read them as features newly released in 2025 to 2026. This is not the result of measuring the features by logging in, paying or connecting devices ourselves.

- Frequency is the **minimum number of services, out of all 13 surveyed, whose official material we confirmed to offer the feature.** It is not market share or a complete survey of supported and unsupported services.
- We do not conclude that a service not on the list does not support the feature. Anything not confirmed is **unconfirmed**.
- 7 or more is classed as common, 4 to 6 as medium, and 1 to 3 as optional. A running-only feature can matter in its field even if its overall frequency is low.
- Paid and integration features are included. Even a feature with the same name can differ in scope by platform, device and plan.
- Overseas prices are US public USD prices, and annual amounts are the total for one year of payment. They may differ from Korean prices, taxes and promotions.
- An app store can show legacy, experimental and promotional subscription products together. Do not read the lowest and highest amounts in a product list as plans that apply to every new user.
- We keep observed competitor features separate from proposals for this project. The backlog below is not a list of what is implemented.

## Features, prices, platforms and web per service

The service name links are the feature sources, and the extra sources for price and platform are linked in the last column.

| Service                                 | Main features                                                               | Free and paid prices                                                                                                                                                              | Platforms                                                     | Web version for actual workout management                                                                         | Extra sources                                                       |
| --------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Strong][strong]                        | Weight logging, timer, 1RM, body measurements                               | Free: 3 routines, unlimited workout logs. PRO $4.99 per month / $29.99 per year. A lifetime product at $99.99 is shown                                                            | iOS, Android, Apple Watch                                     | Browser logging unconfirmed                                                                                       | [Official store][strong-store]                                      |
| [Hevy][hevy]                            | Logging, statistics, social, routine sharing                                | Free has limits such as 4 routines and 7 custom exercises. PRO $2.99 per month / $23.99 per year / $74.99 lifetime                                                                | iOS, Android, Apple Watch, web                                | Yes: logging and routine management                                                                               | [Price][hevy-price], [Web support][hevy-web]                        |
| [JEFIT][jefit]                          | Exercise library, routines, community, automatic progression                | Basic is free. Elite $12.99 per month / $69.99 per year. A first-year $52.49 promotion was shown at the time of research                                                          | iOS, Android, web, Apple Watch, Wear OS                       | Yes: planning, logging and analysis                                                                               | [Price][jefit-price], [Platforms][jefit-platform]                   |
| [FitNotes][fitnotes]                    | Simple logging, backup, CSV                                                 | Free by default, no ads. The price of a separate Supporter purchase is unconfirmed                                                                                                | Android                                                       | Logging web app unconfirmed                                                                                       | [Official store][fitnotes-store]                                    |
| [Strava][strava]                        | Running and cycling, routes, segment rankings, community                    | Free by default. $11.99 per month / $79.99 per year                                                                                                                               | iOS, Android, web, compatible watches and GPS devices         | Yes: analysis, routes and file management                                                                         | [Price][strava-price], [Devices][strava-devices]                    |
| [Nike Run Club][nrc]                    | Run logging, audio coaching, plans, challenges                              | Free, no in-app purchases                                                                                                                                                         | iOS, Android, Apple Watch and others                          | Official guidance is to view in the app. A standalone logging web app is unconfirmed                              | [Official FAQ][nrc-faq], [Store][nrc-store]                         |
| [Garmin Connect][garmin]                | Integrated workout and health, training plans, recovery, device sync        | Free by default. Connect+ public price $6.99 per month / $69.99 per year. Device cost is separate                                                                                 | iOS, Android, web, Garmin devices                             | Yes: workout and health analysis and planning                                                                     | [2025 public price][garmin-plus]                                    |
| [Fitbod][fitbod]                        | Workout recommendations based on equipment, goals, performance and recovery | Subscription after a trial. Web purchase $15.99 per month / $95.99 per year                                                                                                       | iOS, Android, compatible watches                              | Sign-up and payment are offered. The FAQ states the web is for onboarding. A workout-entry web app is unconfirmed | [FAQ][fitbod]                                                       |
| [MyFitnessPal][mfp]                     | Meals, calories, nutrients, weight, workout logging                         | Free by default. Premium $79.99 per year. Premium+ $24.99 per month / $99.99 per year                                                                                             | iOS, Android, web, external health services                   | Yes: meals, workouts and body measurements                                                                        | [Price][mfp-price], [Web measurements][mfp-measures]                |
| [Apple Fitness / Fitness+][apple-store] | Activity rings, workouts, training load, sharing / paid workout videos      | Fitness is free. Fitness+ in the US $9.99 per month / $79.99 per year                                                                                                             | iPhone, Apple Watch. Fitness+ also supports iPad and Apple TV | Browser workout management unconfirmed                                                                            | [Fitness+][apple-plus], [Regional notice][apple-markets]            |
| [Google Fit][google-fit]                | Steps, activity, Heart Points, weight                                       | Free                                                                                                                                                                              | Android, iOS, Wear OS                                         | A consumer logging web app is unconfirmed                                                                         | [Help][google-fit-help], [2026 transition notice][google-health]    |
| Planfit (플랜핏) [planfit]              | Equipment-based AI routines, weight and rep recommendations, voice coaching | Free by default. Products such as KRW 10,900 to 13,900 per month / KRW 64,900 to 69,900 per year are shown on the Korean iOS store. Actual applied prices are unconfirmed         | iOS, Android, Apple Watch                                     | A web generator guide and login exist. Logging equal to mobile is unconfirmed                                     | [Korean store][planfit-store], [Generator guide][planfit-generator] |
| Burnfit (번핏) [burnfit]                | Weights, 1RM, fatigue, routines, meals, AI reports                          | Free by default. Products such as KRW 5,900 and 9,900 per month / KRW 42,500, 49,500 and 69,900 per year are shown on the Korean iOS store. Actual applied prices are unconfirmed | iOS, Android, Apple Watch                                     | A personal logging web app is unconfirmed                                                                         | [Korean store][burnfit-store]                                       |

### Service scopes that are easy to confuse

1. FitNotes is **James Gay's Android app**. We did not merge in the features of an iOS app with a similar name. The official store shows a 2025-10-24 update and 2026 user reviews.
2. We separate Apple's free Fitness and the paid Fitness+. We did not judge whether a Fitness+ subscription is available in Korea just from the Fitness app being offered in Korea. **The Korean price of Fitness+ is unconfirmed.**
3. On 2026-05-07 Google announced the transition of the Fitbit app to Google Health and its plan to notify Google Fit users about moving their data within the year. We did not add the new features of Google Health to Google Fit. Whether an individual user has finished the transfer is unconfirmed.
4. The 2026 deprecation notice for the Google Fit API is not the same as an immediate shutdown of the consumer app. Building a new integration needs a check of the [official migration guide][google-fit-api].
5. Fitbod's older help pages also describe viewing reports on the web, but the current FAQ states that the web is for onboarding. So we did not count it as a full workout logging web app.

## Features and confirmed frequency in 11 areas

NRC means Nike Run Club, Garmin means Garmin Connect, MFP means MyFitnessPal, and Apple means Fitness/Fitness+. The evidence for the offering services is the per-service official links above, and detailed exceptions are written after the table.

| Area                | Feature                                                                    | Services where offered was confirmed                                             | Minimum frequency      |
| ------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| Workout logging     | Weight, reps, sets                                                         | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, Planfit, Burnfit                  | 8/13 · common          |
| Workout logging     | Viewing, loading and copying previous records                              | Strong, Hevy, FitNotes, Fitbod, Planfit, Burnfit                                 | 6/13 · medium          |
| Workout logging     | Rest timer between sets                                                    | Strong, Hevy, JEFIT, FitNotes, Planfit, Burnfit                                  | 6/13 · medium          |
| Workout logging     | Set structures such as supersets and drop sets                             | Strong, Hevy, JEFIT, FitNotes, Fitbod, Planfit, Burnfit                          | 7/13 · common          |
| Workout logging     | RPE logging                                                                | Strong, Hevy, Burnfit                                                            | 3/13 · optional        |
| Workout logging     | GPS, distance, time, pace                                                  | Strava, NRC, Garmin, Google Fit                                                  | 4/13 · core for cardio |
| Routines            | Creating, saving and reusing your own routines                             | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, Planfit, Burnfit                  | 8/13 · common          |
| Routines            | Pre-made and personalized training programs                                | Hevy, JEFIT, NRC, Garmin, Fitbod, Apple, Planfit, Burnfit                        | 8/13 · common          |
| Routines            | Adjusting the next weight or exercise based on performance                 | Hevy Trainer, JEFIT, Fitbod, Planfit, Burnfit                                    | 5/13 · medium          |
| Statistics          | Graphs of weight, volume and strength growth                               | Strong, Hevy, JEFIT, FitNotes, Fitbod, Planfit, Burnfit                          | 7/13 · common          |
| Statistics          | Estimated 1RM and personal records                                         | Strong, Hevy, JEFIT, FitNotes, Fitbod, Burnfit                                   | 6/13 · medium          |
| Statistics          | Volume and set distribution per body part                                  | Hevy, JEFIT, Fitbod, Burnfit                                                     | 4/13 · medium          |
| Statistics          | Reflecting recovery and fatigue in exercise choice                         | Garmin, Fitbod, Planfit, Burnfit                                                 | 4/13 · medium          |
| Body measurements   | One or more of weight, body composition and circumference                  | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, MFP, Google Fit, Planfit, Burnfit | 10/13 · common         |
| Body measurements   | Progress photos                                                            | Strong, Hevy                                                                     | 2/13 · optional        |
| Body measurements   | Entering data by scanning a body composition report                        | Planfit                                                                          | 1/13 · optional        |
| Social              | Friends, feed, groups, activity sharing                                    | Hevy, JEFIT, Strava, NRC, Garmin, Apple, Planfit, Burnfit                        | 8/13 · common          |
| Social              | Sharing routines and workout structures                                    | Strong, Hevy, JEFIT, Fitbod, Burnfit                                             | 5/13 · medium          |
| Device integration  | Doing and logging workouts on a watch, or syncing device records           | Strong, Hevy, JEFIT, Strava, NRC, Garmin, Fitbod, Apple, Planfit, Burnfit        | 10/13 · common         |
| Device integration  | Connecting GPS and workout devices from several makers                     | Strava, NRC, Garmin                                                              | 3/13 · optional        |
| Goals and badges    | Challenges, badges, points, competing with friends                         | JEFIT, Strava, NRC, Garmin, Apple                                                | 5/13 · medium          |
| Goals and badges    | Visualizing workout streaks and consistency                                | Hevy, Fitbod, Planfit                                                            | 3/13 · optional        |
| AI recommendations  | Explicitly states AI or learning-based exercise and weight recommendations | JEFIT, Fitbod, Planfit, Burnfit                                                  | 4/13 · medium          |
| AI recommendations  | Natural-language insights and reports                                      | Strava, Garmin, Burnfit                                                          | 3/13 · optional        |
| Nutrition           | Logging food, calories and macros                                          | MFP, Burnfit, Garmin Connect+                                                    | 3/13 · optional        |
| Nutrition           | Entering food by photo, voice or barcode                                   | MFP                                                                              | 1/13 · optional        |
| Nutrition           | Meal plans, recipes and shopping lists                                     | MFP Premium+                                                                     | 1/13 · optional        |
| Data export         | Exporting the user's data as a file                                        | Strong, Hevy, FitNotes, Strava, Garmin, MFP, Google Fit                          | 7/13 · common          |
| Supported platforms | A consumer logging and management web version                              | Hevy, JEFIT, Strava, Garmin, MFP                                                 | 5/13 · medium          |

### Limits on interpreting the features

- **Hevy Trainer:** the [official description][hevy-trainer] describes an adaptive algorithm and automatic weight adjustment. We classed it as an automatic recommendation but did not conclude that it is generative AI.
- **JEFIT:** the [FAQ][jefit] says Strength Engine is available and Mesocycle Adaptation is planned. The [2026 introduction][jefit-platform] describes 4-week periodization. The material does not agree, so the full scope offered to users of finished automatic periodization is unconfirmed.
- **Body measurements:** a service where you can only enter weight is not the same as a service that also supports body fat, circumference and photos. Refer to these separately: [Hevy measurements][hevy-measures], [Fitbod Apple Health integration][fitbod-health], [Garmin weight guide][garmin-weight], [MFP measurements][mfp-measures], and [JEFIT's own service description][jefit-body].
- **AI analysis:** [Strava Athlete Intelligence][strava-ai] is a generative AI activity summary. Keep it separate from a feature that generates workout plans.
- **Nutrition extension:** [Garmin's 2026 description of Connect+][garmin-dashboard] includes logging calories and nutrients. Do not read it as a free default feature.
- Support in the platform column does not mean the same detailed features are offered on every platform.

## Data export and backup comparison

| Service                              | Confirmed method and limits                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Strong                               | [Workout data CSV][strong-export]                                                                                    |
| Hevy                                 | [Export workout and body measurement data][hevy-export], usable in a spreadsheet                                     |
| FitNotes                             | [Workout and body measurement CSV and a separate backup file][fitnotes-data]. It cannot be restored from CSV         |
| Strava                               | [Original activity files, GPX, TCX and a full account download][strava-export]. Export is offered on the web         |
| Garmin                               | [Export activity files on the web][garmin-export]                                                                    |
| MFP                                  | [Premium CSV export][mfp-export]                                                                                     |
| Google Fit                           | [Google Takeout download][google-fit-help]                                                                           |
| Apple Fitness                        | Its own export is unconfirmed. Workout and health data stored in Apple Health can be exported as [XML][apple-export] |
| JEFIT, Fitbod, Planfit, Burnfit, NRC | No standard CSV or full-record export procedure that you run yourself was confirmed                                  |

Backup, CSV for analysis, and syncing with other services are separate features. We do not judge that a user holds a recoverable backup just because cloud sync exists.

## Basic features and differentiation analysis

The following is **a proposal for Workout Memo** based on the research results.

### Basic features

- Logging and editing or deleting exercise, total weight, reps and sets by date.
- Viewing and loading previous records and copying sets, saving routines and loading today's workout.
- Rest timer and set-done marks, a calendar and per-exercise history.
- Weight and volume trends and PRs, save-failure notices, retry and backup.
- Access to the same server records from mobile and PC, CSV export and a restorable backup.
- Custom exercises, equipment and units. Extend body measurements after the basic records are stable.

### Differentiation candidates that fit the project

| Direction                   | Reference services                            | Candidate to apply                                            |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Minimal input               | Strong, Hevy, FitNotes, Burnfit               | Suggest the previous values and edit only what changed        |
| Guidance on the next goal   | Hevy Trainer, JEFIT, Fitbod, Planfit, Burnfit | Show the conditions for adding weight or reps, and the goal   |
| Linking recovery and plan   | Garmin, Fitbod, Planfit, Burnfit              | Move the rest schedule and state deloads explicitly           |
| Reflecting the equipment    | Fitbod, Planfit                               | Reflect the real machine, plate and dumbbell ranges           |
| Easy-to-understand analysis | Hevy, JEFIT, Burnfit                          | Weekly sets per body part, PRs, and performance against goals |
| Data portability            | Strong, Hevy, FitNotes, Strava                | Distinguish CSV from a restorable backup                      |

Give priority to the already requested link of **12-week plan → weekly goal → actual record → next goal**. Show in advance the schedule change from choosing rest today and the last goal that would be dropped. For machine weight, distinguish base weight, added plates and total weight, and the official source, the check date and unconfirmed. Verify with a focus on plan editing on PC and logging today's workout on mobile.

From this material alone we do not claim that this combination is entirely missing from competing services or is a market first. Judging competitiveness needs an additional comparison of real usability.

## 2025 to 2026 trends

1. **Guidance on the next action after logging:** Fitbod, Hevy Trainer and Burnfit adjust exercises or weights according to performance and recovery. This extends from simple graphs to deciding the next workout.
2. **Recommendations and commentary diverge:** a feature that decides exercises and weights and the natural-language insights of Strava and Garmin are different benefits. Do not group them as the same feature just because they are called AI.
3. **Input automation:** a direction that reduces typing, such as MFP's food photo and voice input and Planfit's body composition report scan. The [Planfit update][planfit-store] announces report scanning in September 2026.
4. **Integrating workout, recovery, body and nutrition:** Garmin, Burnfit and the Google Health transition are examples. As the integration scope grows, the stability of integrations and data portability become important.
5. **Free basics + paid advanced:** charging for advanced statistics, recommendations, AI, plans and watches. The actual paid boundary of each service needs to be checked against the prices above and the help pages.

## Complaints repeatedly observed in 2025 to 2026 reviews

These are qualitative observations from public reviews and communities and are not representative sample statistics. We did not count several posts about the same outage as independent outages. Whether they reproduce in the current version, or the defect rate, is unconfirmed.

| Topic                                              | Public cases                                                                                 | Project response                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Subscription fees and paywalling existing features | JEFIT [watch-related 2025.6][review-jefit-watch], [quick workout 2025.7][review-jefit-quick] | Keep the scope of basic logging and data access                     |
| Sync delays and missing records                    | NRC [2025.4][review-nrc-apr], [2025.5][review-nrc-may]                                       | Keep drafts, confirm saves, and resend without duplicates           |
| Feature differences by platform and release        | Fitbod [2025.7][review-fitbod-2025], [2026.5][review-fitbod-2026]                            | State the mobile and PC scope and verify the core flows             |
| Low practicality and inaccurate commentary of AI   | Garmin [2025.10][review-garmin-oct], [2025.12][review-garmin-dec]                            | Put factual calculation first and show the basis of recommendations |
| Accuracy of basic data                             | MFP [2025.5 opinions from several users][review-mfp]                                         | Show the source, edits and unconfirmed                              |
| Web and mobile feature differences                 | Hevy [request for web statistics 2025.7][review-hevy]                                        | Check the main tasks on PC and mobile                               |

The last two rows are cases where several opinions or requests were confirmed in a limited number of posts, and they are not evidence of a high frequency across the whole service.

## Additional implementation issues and avoiding duplicates

This request is **documentation and issue registration only.** We do not implement the code of the features below or register them in the worker queue.

| Order    | Issue                                                                                                                                                     | Scope and dependencies                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Existing | [#16 Logs and sets](https://github.com/sirloinbh/workout-memo/issues/16), [#17 Statistics by period](https://github.com/sirloinbh/workout-memo/issues/17) | Reuse the core logging and period queries                                                   |
| Existing | [#27 12-week routine](https://github.com/sirloinbh/workout-memo/issues/27)                                                                                | Split, body parts, weekly goals, deload                                                     |
| Existing | [#28 Goals, rest and easy input](https://github.com/sirloinbh/workout-memo/issues/28)                                                                     | Routine draft, minimal input, schedule shift. Do not create a duplicate card                |
| Existing | [#29 Machine official base weight](https://github.com/sirloinbh/workout-memo/issues/29)                                                                   | Distinguish the official source from unconfirmed                                            |
| Added P1 | [#31 Set completion, rest timer, RPE](https://github.com/sirloinbh/workout-memo/issues/31)                                                                | Linked to #16/#28. Distinguish a draft from actual performance                              |
| Added P1 | [#34 Draft, save state, retry](https://github.com/sirloinbh/workout-memo/issues/34)                                                                       | Save confirmation, lost responses, concurrent edits, preventing duplicates                  |
| Added P1 | [#33 CSV, backup, restore](https://github.com/sirloinbh/workout-memo/issues/33)                                                                           | Separate CSV for analysis from the restore format. Consider reusing the existing SQL backup |
| Added P2 | [#32 PR, estimated 1RM, volume per body part](https://github.com/sirloinbh/workout-memo/issues/32)                                                        | Extends #17, depends on the #27 body-part mapping                                           |
| Added P2 | [#35 Body measurements and trends](https://github.com/sirloinbh/workout-memo/issues/35)                                                                   | Weight, body fat percentage, skeletal muscle mass. Reuse the #17 period selection           |

P1/P2 is the order proposed in this document and is not a GitHub label, milestone or confirmed schedule. Use each card's completion criteria and verification method as the basis when starting implementation.

### Lower-priority review list

Social, badges, a food DB, photo/OCR, a watch app, generative AI commentary, importing CSV from other services, and full offline sync are not included in this round of new implementation cards. First evaluate the benefit for personal use and the development, operation and AI call costs. We did not make a separate duplicate card for mobile/PC usability and included it in the verification criteria of each UI card.

## Sources

The links below are the public material we checked at the time of research. Check again before applying any price or release scope that changes.

[strong]: https://www.strong.app/
[strong-store]: https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
[strong-export]: https://help.strongapp.io/article/235-export-workout-data
[hevy]: https://www.hevyapp.com/features/
[hevy-price]: https://www.hevyapp.com/hevy-pricing-comparison/
[hevy-web]: https://www.hevyapp.com/use-cases/workout-logger/
[hevy-trainer]: https://www.hevyapp.com/features/workout-plan-generator/
[hevy-measures]: https://www.hevyapp.com/features/track-body-measurements/
[hevy-export]: https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy
[jefit]: https://www.jefit.com/support/faq
[jefit-price]: https://cdn.jefit.com/elite
[jefit-platform]: https://www.jefit.com/blog/jefit-vs-caliber
[jefit-body]: https://www.jefit.com/wp/guide/best-workout-apps-for-2026-top-7-options-tested-and-reviewed/
[fitnotes]: https://www.fitnotesapp.com/help_overview/
[fitnotes-store]: https://play.google.com/store/apps/details?id=com.github.jamesgay.fitnotes
[fitnotes-data]: https://www.fitnotesapp.com/settings/
[strava]: https://www.strava.com/gift
[strava-price]: https://www.strava.com/pricing
[strava-devices]: https://support.strava.com/en-us/articles/16312772-what-devices-and-apps-are-compatible-with-strava
[strava-ai]: https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava
[strava-export]: https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data
[nrc]: https://www.nike.com/nrc-app
[nrc-faq]: https://www.nike.com/nz/nrc-app
[nrc-store]: https://apps.apple.com/us/app/nike-gps/id387771637
[garmin]: https://connect.garmin.com/
[garmin-plus]: https://www.garmin.com/en-US/newsroom/press-release/wearables-health/elevate-your-health-and-fitness-goals-with-garmin-connect/
[garmin-dashboard]: https://www.garmin.com/en-US/blog/fitness/what-is-the-garmin-connect-performance-dashboard/
[garmin-weight]: https://support.garmin.com/en-US/?faq=zS4yMMr7REAVHBPYY6DaZ5
[garmin-export]: https://support.garmin.com/en-IN/?faq=W1TvTPW8JZ6LfJSfK512Q8
[fitbod]: https://fitbod.me/faqs/
[fitbod-health]: https://help.fitbod.me/hc/en-us/articles/360047357794-Apple-Health
[mfp]: https://support.myfitnesspal.com/hc/en-us/articles/15457546881805-What-is-included-in-the-free-version
[mfp-price]: https://www.myfitnesspal.com/premium-plus
[mfp-measures]: https://support.myfitnesspal.com/hc/en-us/articles/360032624891-Can-I-track-additional-measurements-or-change-the-default-measurements
[mfp-export]: https://blog.myfitnesspal.com/myfitnesspal-vs-mynetdiary/
[apple-store]: https://apps.apple.com/kr/app/apple-fitness/id1208224953
[apple-plus]: https://www.apple.com/apple-fitness-plus/
[apple-markets]: https://www.apple.com/newsroom/2025/12/apple-fitness-plus-expands-to-28-new-markets/
[apple-export]: https://support.apple.com/en-gb/guide/iphone/iph5ede58c3d/27/ios/27
[google-fit]: https://www.google.com/fit/
[google-fit-help]: https://support.google.com/fit/faq/6108483?hl=en
[google-health]: https://blog.google/products-and-platforms/products/google-health/google-health-app/
[google-fit-api]: https://developers.google.com/fit/overview
[planfit]: https://planfit.ai/ko
[planfit-store]: https://apps.apple.com/kr/app/id1511876936
[planfit-generator]: https://planfit.ai/ko/ai-workout-generator
[burnfit]: https://burnfit.io/en/
[burnfit-store]: https://apps.apple.com/kr/app/id1503464984
[review-jefit-watch]: https://www.reddit.com/r/jefit/comments/1ldqu3a/really_you_need_elite_now_to_use_your_watch_during/
[review-jefit-quick]: https://www.reddit.com/r/jefit/comments/1ll9bq3/regarding_the_new_update_quick_exercise_is_now/
[review-nrc-apr]: https://www.reddit.com/r/nikerunclub/comments/1k3nx74/
[review-nrc-may]: https://www.reddit.com/r/nikerunclub/comments/1kekizn/
[review-fitbod-2025]: https://www.reddit.com/r/fitbod/comments/1m0s3dz/
[review-fitbod-2026]: https://www.reddit.com/r/fitbod/comments/1tgoan3/no_focus_exercises_injury_mode_at_my_phone/
[review-garmin-oct]: https://www.reddit.com/r/Garmin/comments/1ojn9qw/we_all_tried_garmin_ai_on_launch_and_it_sucked/
[review-garmin-dec]: https://www.reddit.com/r/Garmin/comments/1plwz2g/connect_ai_is_a_joke/
[review-mfp]: https://www.reddit.com/r/Myfitnesspal/comments/1kiiath/does_premium_have_more_accurate_food_data/
[review-hevy]: https://www.reddit.com/r/Hevy/comments/1ltt91f/is_there_a_way_to_show_the_statistics_in_the_web/
