# #515 Mark Korean data keys for the standards check

The central check (sirloinbh/project-standards#1129) fails on Korean outside comments in `frontend/src`. What was left is not screen text: stored body-part keys (`labels.ts` shows the English labels) and InBody Korean column names the importer must recognize. Each place now says so with a `korean-ok` marker; no behavior changes.

| File                                          | Marker                                  |
| --------------------------------------------- | --------------------------------------- |
| `frontend/src/inbody.ts`                      | `korean-ok-file`: Korean InBody names   |
| `frontend/src/labels.ts`, `routines/model.ts` | `korean-ok-file`: stored body-part keys |
| `frontend/src/rest-timer.ts`, `analysis.tsx`  | `korean-ok` on the lines                |
