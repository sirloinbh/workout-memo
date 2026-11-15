# #103 Replace the trend, record form, and list on the body records screen with shared components (step 4)

- Issue: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- Branch: `feat/103-body-records`

## Purpose

This is the fourth PR in moving #103 over one element at a time. After steps 1 to 3 (backup #225, machine list #230, machine form #231), move the error and status text, the record form, the per-metric trend graphs, and the record list of the body records screen. The page header (`.page-heading`) and the "인바디 가져오기" ("import InBody") and "신체 기록 추가" ("add body record") buttons inside it are in the scope of #222, so they are left as they are. The remaining steps are the InBody import preview table (step 5) and the `style.css` cleanup (step 6).

## Change — feat: replace the body records screen

- `frontend/src/body.tsx`
  - Load failure: replaced `.error` with #223's `AlertBanner` and moved "다시 연결" ("reconnect") to a `Button` (`outline`, `sm`) in its `action` slot.
  - Save and delete complete text: replaced the bare `p role="status"` with the shared `Notice`.
  - Record form: wrapped `form.card.body-form` in a `Card` (title h2). The form error is an `AlertBanner`. Inputs are the same `Label` (+ `fieldLabel`) and shared `Input` (touch 16px kept) as the My goals and machine forms. The two-cell layout uses utilities instead of `.form-grid`, and on touch phones (480px and below) it is one cell. The hint is a gray box utility, and "신체 기록 저장" ("save body record") and "취소" ("cancel") are the shared `Button`. Weight, body fat percentage, and skeletal muscle mass are decimal values, so they use the shared `Input` instead of the `NumberInput` with -/+ buttons.
  - Trend graphs: moved the `.body-trends` and `.body-trend*` rules to utilities on the drawing elements. The line and dot colors are the `stroke-primary` and `fill-primary` tokens. The graph name (`role="img"`, `aria-label`) is unchanged.
  - Record list: replaced `section.card`, `.section-title`, `.count`, `.empty`, and `.workout-row` with the same `Card`, `Badge`, `EmptyState` (h3), `List` ("신체 기록", "body records"), and `ListItem` as the workout records and the machine list. Edit and delete are the shared `Button` (`ghost`, `sm`) and the names ("날짜 신체 기록 수정/삭제", "edit/delete <date> body record") are unchanged.
- `frontend/src/style.css`: removed `.body-form`, `.body-form fieldset`, `.body-trends`, `.body-trend-missing`, `.body-trend` and the 5 rules below it (`figcaption`, `svg`, `polyline`, `circle`), `.body-trend-axis`, `.body-list`, and the 760px media rule for `.body-trends`. `.form-grid` (journal edit, InBody, Routine planner), `.heading-actions` and `.subtle-button` (page header, #222), `.card`, `.workout-row`, and so on stay because other screens still use them.
- Screen difference: the record form and list get the same spacing and text size as the cards on other screens. The graph axis text grows from 9px to 12px, the graph title row and hint box text from 11px to 12px, and the width at which the 3 graphs sit in one row changes from 761px to `md` (768px).

## Tests

- Added: 1 test in `frontend/src/body.test.tsx`. It checks that the list card title reads together with the count ("신체 기록 4", "body records 4"), that the list row titles (h3) are in reverse date order, the edit button name, the form title and the metric cell names (`spinbutton`), that saving an empty form is rejected with an `alert`, that after saving `status` announces and the form closes, and that "취소" ("cancel") closes the form without saving.
- Changed: the `.body-list > li` selector in the same file now uses the "신체 기록" ("body records") list role. What is verified is the same.
- `npm run test -w frontend -- src/body.test.tsx src/inbody-import.test.tsx`: 10 pass right after the replacement, and `body.test.tsx` 8 pass after the test was added
- `npm run typecheck -w frontend`, eslint (changed files), prettier: pass
- The full local `npm run check` and e2e were not run because there is a history of running out of memory. e2e (responsive, axe, touch, visual baselines) is checked by the PR CI.

## Change — test: update visual baselines

- The first review had no required follow-ups. The 2 optional ones (the number of removed rules, more detail on screen differences) are documentation, so they were applied in this commit. There was no code follow-up, so there is no second review.
- In CI `e2e-visual` for `ca3938f`, only the 4 `body` 360, 390, 768, 1280 images failed, and 77, including axe, responsive, and touch, passed. The 360 and 1280 images were viewed directly and showed no difference apart from the trend cards, the hint box, and the list cards and rows. The page header is unchanged. After that the 4 images were updated with the `visual-baselines` artifact. The other images were byte-for-byte the same as the existing baselines.
- Limitation: the e2e fixed data has no empty period, load failure, or open record form, so the empty state, `AlertBanner`, and the form do not appear in the images. They were checked only with the screen tests (`body.test.tsx`).
