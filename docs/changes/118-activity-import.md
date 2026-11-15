# #118 Research on ways to import Garmin and Nike Run Club records

- Issue: [#118](https://github.com/sirloinbh/workout-memo/issues/118) (parent #217)
- Branch: `docs/118-activity-import`

## Purpose

To decide how a personal single-user app can import Garmin and NRC running records legally and reliably, I researched official APIs, exports, terms, costs, and file formats. No code is changed.

## Change — docs

- New document [`docs/activity-import.md`](../activity-import.md): for each route, whether it is possible, its limits, and source links; the mapping to `cardio_sessions` fields and the values that are dropped; later lap formats (FIT, TCX, Health Connect); a comparison of FIT reading and ZIP handling; a proposed scope for the follow-up issues (#119, #120, #121); and 8 items for the user to decide.
- Key finding: with the Personal API that Garmin released in 2026, the user can read their own data without approval (checked directly on the official page). NRC has no official API.

## First review

- A check against the official documents (the Garmin Personal API FAQ wording, the Health Connect 30-day rule, Strava single-user mode and limits, the TCX `Sport` values) found everything correct.
- Applied (required): the `source` value of NRC records received through Strava (there is no `strava` now) was added to the scope of #120 and to the decision items. A section "7-1. Common" was added with the shared rule that prevents duplicates caused by different sources (file and Personal API), token and key storage, original files and personal data, and the sync interval. The decision items became 8.
- Applied (optional): "30-day limit" in the table was changed to "records older than 30 days before the permission was granted", Strava "read" limit was changed to "requests other than uploads", and the official permission names were added.

## User decisions applied

- The 8 user decisions of 2026-11-08 were written as a table in chapter 10 of the document (Personal API, installing `@garmin/fitsdk` and `fflate`, NRC on hold, `total_timer_time`, Health Connect on hold, `source=nike`, duplicates within ±2 minutes and ±1%, and syncing twice a day). The scope in the bodies of #119, #120, and #121 was also changed to match these decisions.

## Checks

- For the source links I preferred official documents, and anything I could not confirm from an official source is marked "확인 못 함" (could not confirm). I opened the Garmin Personal API page and FAQ directly and checked the wording.
- prettier, `npm run test:docs`, relative link check: passed
