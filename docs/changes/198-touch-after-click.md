# #198 Extend the touch check to the screens after a click

- Issue: [#198](https://github.com/sirloinbh/workout-memo/issues/198)
- Branch: `feat/198-touch-after-click`
- Depends on: #104 (input text and tap targets on touch devices)

## Purpose

The touch device check (`e2e/ui-touch.spec.ts`) only looked at the elements visible when a page is opened, the 3 modals, and the exercise analysis body part chips and the routine form that were added in #102. It did not check that the body records form that opens only on a click, the InBody preview, and the elements inside `details` that show only when expanded meet text 16px, tap target 44px, and no horizontal overflow.

## Change — test: add the screens after a click to the touch check

- `e2e/ui-touch.spec.ts`
  - Helper `openDetails(root)`: expands every `details` inside the checked area. The page check and the routine form check call it before checking. The targets are "세트 기록 보기" (view set records) of the workout record list, "12주 전체 목표" (all 12-week goals) of the routine goal card, and "분석 기준 안내" (analysis criteria guide) and "기록 없는 부위" (body parts without records) of the exercise analysis, and so on. The 12-week preview of the routine builder is open from the start. For the exercise analysis, which always has something to expand, it checks that the number expanded is not 0, so the check does not pass empty when the screen changes.
  - New check "신체 기록의 기록 폼과 인바디 미리보기가 기준을 지킨다" (the record form and InBody preview of body records meet the criteria) (touch 360, 390, 768px):
    - It opens the record form with "신체 기록 추가" (add a body record) and checks it.
    - It opens "인바디 가져오기" (import InBody), uploads a CSV file (the same header and 3 rows as the unit test), and checks after the preview table and the `Checkbox` of each row appear.
  - The routine form (rest day `Checkbox`, 12-week direct input) and the exercise analysis body part chips were already added in #102.
- The shared e2e helper (`e2e/support/ui-fixtures.ts`) was not changed. The specs related to the workout log editor (workout-editor) and the visual baselines overlap with the #105 work, so I did not touch them.
- The visual baselines (`ui-visual`) do not change. `details` is expanded only inside the touch check.

## Out of scope

- The InBody "사진에서 읽은 글자" (text read from the photo) `details` appears only after the browser does text recognition on a result sheet photo. The e2e does not run text recognition, so I did not put it in this check. The element inside is a single `pre`, so there is no tap target.

## Tests

- `npm run typecheck` (including e2e), eslint and prettier (changed files): passed
- I did not run e2e locally because the PC is low on memory. In the PR CI `e2e-visual` (`5552812`), all 88 passed, and the new check ran at 360, 390, and 768px. No violation showed up, so I did not change the app code.

## First review

- No required comments. I confirmed that the checked scope (`main .legacy`) really has elements and that the check runs after the InBody preview is drawn.
- Applied (optional): `openDetails` returns the number expanded and the exercise analysis checks that it is not 0. The routine form check also checks the auto-mode 12-week preview before switching to direct input. I corrected the wording of the purpose, the targets, and the number of CSV rows in this document.
