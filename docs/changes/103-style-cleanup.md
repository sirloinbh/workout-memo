# #103 style.css 정리와 남은 경고 문구 교체 (6단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-style-cleanup`

## 목적

#103을 요소마다 나눠 옮긴 마지막 PR입니다. 1~5단계(백업 #225, 머신 목록 #230, 머신 폼 #231, 신체 기록 #235, 인바디 #236)에서 남긴 일을 정리합니다.

- `style.css`에서 이제 어느 화면도 쓰지 않는 규칙을 지웁니다.
- 1~5단계에 흩어진 폼 클래스 상수를 한 곳으로 모읍니다.
- 조율 창 요청대로 백업 화면의 실패 문구와 전체 교체 경고를 #223의 `AlertBanner`로 바꿉니다. #236 리뷰의 선택 지적 2건(열 선택 비활성 모양, 일부 행 저장 실패 문구)도 반영합니다.

## 변경 — refactor: 정리

- `frontend/src/style.css`: 클래스 이름을 소스(`frontend/src`, `e2e`) 전체에서 낱말 단위로 찾아, `className`으로 쓰는 곳이 없는 규칙을 지웠습니다.
  - 지운 규칙: `.card`, `.section-title`(+`p`, 760px 규칙), `.count`(+대비 규칙 목록), `.text-button`, `.empty`(+`h3`, `p`), `.workout-row`(+`:last-child`, 760px 규칙), `.workout-info`(+`h3`, `p`, 760px 규칙), `.icon-button`, `.full`. `workout-row`는 이제 `data-slot` 이름으로만 남아 있습니다.
  - 남긴 규칙: `:where(.legacy) h2`(종목 분석·루틴짜기·백업의 페이지 제목), `.form-grid`·`.modal …`·`.workout-fields`·`.subtle-button`(일지 편집 #105), `.form-hint`(일지 편집), `.page-heading`·`.eyebrow`·`.heading-dot`·`.primary`·`.heading-actions`(페이지 머리글 #222), `.routine-page`(루틴짜기), `.field-error`(`FieldError`). `.error`와 종목 분석의 기간 규칙은 아래 "#239 병합"에서 정리했습니다.
- `frontend/src/components/form-styles.ts`(새 파일): 폼 공통 클래스 `fieldLabel`, `touchText`, `selectField`, `textareaField`, `formHint`를 한 곳에 뒀습니다. 그동안 `app.tsx`(나의 목표·머신 폼), `body.tsx`, `inbody-import.tsx`, `backup.tsx`가 같은 문자열을 따로 들고 있었습니다.
  - `selectField`·`textareaField`에 `disabled:cursor-not-allowed disabled:opacity-50`을 넣었습니다(#236 리뷰 선택 1). 인바디 열 선택은 저장 중 `fieldset`이 비활성이 될 때 흐려지고, 머신 폼은 원래 비활성이 되는 일이 없어 모양이 같습니다.
  - 백업 화면의 `nativeSelect`는 `selectField`가 되며 `text-foreground`, `aria-invalid:border-destructive`가 더해집니다. 화면에서 보이는 차이는 없습니다.
  - 나의 목표 폼의 안내 상자와 머신 폼의 안내 상자는 같은 `fieldHint`(`formHint` + `mb-4`)를 씁니다.
  - `docs/design-system.md`의 구성 표에 이 파일을 적었습니다.
- `frontend/src/backup.tsx`: 실패 문구를 `Notice`(error)에서 `AlertBanner`로 바꿨습니다. 전체 교체 미리보기의 삭제 경고는 빨간 글자 문단에서 `AlertBanner`로 바꾸고, 미리보기 요약(`role="status"`) 안이 아니라 바로 위에 따로 두어 실시간 알림 영역이 겹치지 않게 했습니다.
- `frontend/src/inbody-import.tsx`: 일부 행만 저장에 실패하면 "N건은 저장하지 못했습니다. 표의 확인 칸에서 이유를 보고 고친 뒤 다시 저장하세요."를 `AlertBanner`로 보입니다(#236 리뷰 선택 2). 저장한 건수는 그대로 `Notice`입니다.
- 화면 차이: 백업 화면의 오류와 전체 교체 경고가 테두리 있는 경고 상자가 됩니다. 인바디 일부 실패도 경고 상자로 보입니다. e2e 고정 화면에는 이 상태가 없어 시각 기준선 변화는 없을 것으로 봅니다.

## #103 완료 기준 대조

- "앱 전체가 `components/ui`와 토큰만 사용": #103 범위인 신체 기록·머신 라이브러리·백업 화면과 인바디 패널에는 `style.css` 클래스가 남지 않았습니다. 예외는 #222 범위인 페이지 머리글(`.page-heading`, `.primary`, `.subtle-button`, `.heading-actions`)과 페이지 제목 `h2`의 legacy 요소 규칙입니다. 다른 화면(종목 분석 #102, 일지 편집 #105, 루틴짜기)이 쓰는 규칙은 각 이슈가 정리합니다.
- "기존 테스트가 통과하고 전후 스크린샷": 단계마다 CI `e2e-visual`의 전후 이미지를 확인하고 기준선을 갱신했습니다(각 단계 기록 참조).

## 테스트

- 수정: `frontend/src/backup.test.tsx`의 전체 교체 테스트에 삭제 경고가 `alert`이고 `status` 요약 밖에 있는지 확인을 넣었습니다. `frontend/src/inbody-import.test.tsx`의 CSV 저장 테스트에 일부 실패가 `alert`("1건은 저장하지 못했습니다")로, 저장 건수가 `status`로 따로 알려지는지 확인을 넣었습니다.
- `npm run test -w frontend -- src/backup.test.tsx src/inbody-import.test.tsx src/body.test.tsx src/official-weights.test.tsx src/rest-by-exercise.test.tsx src/forms.test.tsx src/goal-suggestion.test.tsx src/goal-list.test.tsx`: 43 pass (확인 추가 뒤 `backup`·`inbody-import` 11 pass)
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과. `npm run knip`은 main과 같은 기존 항목만 보고하고 `form-styles.ts`는 나오지 않습니다.
- 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. e2e(반응형·axe·터치·시각 기준선)는 PR CI로 확인합니다.

## 변경 — 1차 리뷰와 main 병합

- 1차 리뷰는 필수 보완점이 없었습니다. 지운 클래스 9개가 실제 클래스로 쓰이는 곳이 없음을 확인했습니다. 선택 1건으로, 백업 select에 `min-w-0`이, 인바디 select에 `aria-invalid:border-destructive`가 더해진 것도 적어 둡니다(화면 차이 없음). 코드 보완이 없어 2차 리뷰는 하지 않습니다.
- `5ecbbbc`의 CI는 모두 통과했고 시각 기준선 변화도 없었습니다.
- 병합 직전 main에 #238(#102 루틴짜기 계획)이 들어와 `style.css`가 겹쳐 `origin/main`을 merge했습니다. 충돌은 없었습니다.
- #238이 루틴짜기의 기본 체크박스를 공통 `Checkbox`로 바꿔, 터치 규칙 `.legacy label:has(> input[type='checkbox'])`를 쓰는 곳이 없어졌습니다. 이 규칙도 지웠습니다. `type="checkbox"`인 입력은 이제 앱 소스에 없습니다.
- 병합 뒤 `npm run test -w frontend -- src/backup.test.tsx src/inbody-import.test.tsx src/routines.test.tsx src/rest-by-exercise.test.tsx` 28 pass, `npm run typecheck -w frontend`, prettier 통과

## 변경 — #239 병합과 `.error` 삭제

- CI 통과 뒤 병합 직전에 main에 #239(#102 종목 분석 기간)가 들어와 `style.css`가 겹쳐 다시 `origin/main`을 merge했습니다.
- `style.css` 충돌 2곳: 같은 자리에서 main은 종목 분석의 `.period-bar`·`.date-control`·`.range-label`(과 760px 규칙)을, 이 브랜치는 `.card`·`.section-title`·`.workout-row`·`.workout-info`(과 760px 규칙)를 지웠습니다. 두 삭제를 모두 살려 그 자리를 비웠습니다.
- #239가 종목 분석의 오류를 `AlertBanner`로 바꿔 `.error` 클래스를 쓰는 곳이 없어졌습니다(`rg`로 `className`·`classList`·`querySelector`를 확인. 남은 `'error'`는 `Notice`의 `kind` 값). 조율 창 요청대로 `.error`와 `.error button`을 지웠습니다.
- 병합 뒤 클래스 목록 검사에서 쓰지 않는 규칙이 남지 않았습니다. `npm run test -w frontend -- src/analysis.test.tsx src/backup.test.tsx src/inbody-import.test.tsx src/body.test.tsx src/routines.test.tsx` 35 pass, `npm run typecheck -w frontend`, prettier 통과
