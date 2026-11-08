# #222 페이지 머리글과 주요 버튼을 공통 컴포넌트로 교체

- 이슈: [#222](https://github.com/sirloinbh/workout-memo/issues/222)
- 브랜치: `feat/222-page-heading`

## 목적

#101(대시보드·일지)과 #102·#103(나의 목표·머신 라이브러리·신체 기록)에서 각 화면의 카드와 폼은 공통 컴포넌트로 옮겼지만, 페이지 머리글은 legacy 스타일로 남아 있었습니다. 대상은 eyebrow, `h1`, 끝의 점, 설명 문단과 오른쪽 위 주요 버튼입니다. 이 머리글을 공통 부품으로 바꾸고, 쓰는 곳이 없어진 `style.css` 규칙을 지웁니다.

## 변경 — feat: 페이지 머리글 교체

- `frontend/src/components/page-header.tsx`(새 파일): `PageHeader`는 `eyebrow`, `title`, `description`, `actions`를 받습니다.
  - 제목 끝의 흐린 점은 `h1` 안에 그대로 두어, 화면 낭독기가 읽는 제목이 이전과 같습니다.
  - 폰에서는 버튼이 글 아래로, `md`(768px)부터는 오른쪽으로 갑니다.
  - 요소는 `div`입니다. `header`로 두면 테스트 환경에서 앱 셸의 머리글과 별개인 두 번째 `banner` 영역으로 읽혀, 화면 낭독기와 axe에서 헷갈릴 수 있습니다.
  - `components/ui` 중앙 파일은 고치지 않았습니다.
- `frontend/src/app.tsx`: 대시보드·운동 일지·나의 목표·머신 라이브러리의 `.page-heading`을 `PageHeader`로 바꿨습니다.
  - 주요 버튼("운동 기록하기"·"목표 추가"·"머신 등록")은 `button.primary`에서 공통 `Button`(기본)이 됩니다.
  - 로컬 초안이 있으면 대시보드·일지에서 버튼을 비활성화하는 동작은 그대로입니다.
- `frontend/src/body.tsx`: 신체 기록 머리글도 `PageHeader`입니다.
  - "인바디 가져오기"는 `.subtle-button`에서 `Button`(`secondary`)이 되고, 패널이 열렸는지 `aria-expanded`로 알립니다.
  - "신체 기록 추가"는 `Button`이 되고, 다른 화면처럼 `+` 아이콘을 붙였습니다.
- `frontend/src/style.css`: 아래 규칙을 지웠습니다.
  - `.page-heading`(+`p`), `.eyebrow`, `:where(.legacy) h1`, `.heading-dot`, `.primary`(+`:hover`)
  - 1100px 미디어 규칙 전체와 760px 미디어 규칙의 머리글 부분
  - `.heading-actions`, 터치 규칙의 `.legacy a.primary`
  - `.subtle-button`과 `.modal .subtle-button`은 일지 편집 창(#105 범위)이 아직 써서 남깁니다. 남은 `style.css` 클래스는 일지 편집 창의 `.modal …`, `.form-grid`, `.form-hint`, `.workout-fields`, `.subtle-button`과 `FieldError`의 `.field-error`, 그리고 `.legacy` 요소 규칙뿐입니다.
- 화면 차이
  - 주요 버튼이 공통 `Button` 크기(36px, 터치 44px)와 글자(14px)가 됩니다.
  - 제목은 24px이고 `xl`(1280px)부터 28px입니다. 예전에는 1100px 이하에서 23px였습니다.
  - 설명은 12px로, 760px 이하에서 11px로 줄던 규칙이 없어졌습니다.
  - 머리글 아래 여백은 폰 24px, `md`부터 36px입니다.

## 테스트

- 추가: `frontend/src/components/page-header.test.tsx`에 2개를 넣었습니다.
  - 표시: eyebrow·`h1`(끝의 점 포함)·설명·버튼이 나오는지, `banner` 영역이 생기지 않는지 확인합니다.
  - 버튼 없음: `actions`가 없으면 빈 버튼 묶음을 그리지 않는지 확인합니다.
- 수정: `frontend/src/workout-draft.test.tsx`의 초안 복구 테스트에서, 복구 전 머리글의 "운동 기록하기"가 비활성인지 확인합니다. 이 동작을 확인하는 테스트는 그동안 없었습니다. `frontend/src/inbody-import.test.tsx`에서는 "인바디 가져오기"를 누르면 `aria-expanded="true"`가 되는지 확인합니다.
- `npm run test -w frontend -- src/components/page-header.test.tsx src/workout-draft.test.tsx src/period.test.tsx src/body.test.tsx src/goal-list.test.tsx src/official-weights.test.tsx src/routing.test.tsx src/inbody-import.test.tsx`: 79 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. e2e(반응형·axe·터치·시각 기준선)는 PR CI로 확인합니다. 머리글이 있는 dashboard·journal·goals·machines·body 화면과 그 위에 뜨는 모달 이미지의 기준선이 바뀔 것으로 봅니다.

## 변경 — 1차 리뷰 보완

- 1차 리뷰는 필수 보완점이 없었고 선택 4건을 반영했습니다.
  - 설명 문단: `text-meta`가 줄 간격을 16px로 줄여 두 줄 이상인 설명(신체 기록)의 줄 사이가 좁아졌습니다. 예전 `1.7`을 `leading-[1.7]`로 유지합니다.
  - 제목 글자 간격: `tracking-tight`가 예전 -1.2px보다 넓어 `tracking-[-1.2px]`로 맞췄습니다.
  - `e2e/ui-touch.spec.ts`: 터치 크기 검사 대상에서 더는 아무것도 고르지 않는 `a.primary`를 뺐습니다.
  - `frontend/src/workout-draft.test.tsx`: 복구한 뒤에는 머리글 버튼이 다시 활성인지도 확인합니다.
- `docs/design-system.md`의 앱 고유 컴포넌트 설명에 `PageHeader`를 적었습니다.
- `npm run test -w frontend -- src/workout-draft.test.tsx src/components/page-header.test.tsx`: 24 pass. prettier 통과

## 변경 — 2차 리뷰와 시각 기준선 갱신

- 2차 리뷰는 필수 보완점이 없었습니다. 선택 1건을 반영했습니다. 터치 크기 검사가 고르던 `a.primary`는 #103에서 백업 화면의 내려받기 링크가 `Button asChild`로 바뀐 뒤로 아무것도 고르지 않았습니다. 그래서 `e2e/ui-touch.spec.ts`의 대상에 `a[data-slot="button"]`을 넣어, 버튼 모양 링크도 44px 높이를 검사합니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.
- `deb9d57`의 CI `e2e-visual`에서 시각 비교 29건만 실패했습니다. axe·반응형·터치 검사는 통과했습니다.
  - 바뀐 것: 머리글이 있는 `dashboard`·`journal`·`goals`·`machines`·`body` 4폭씩과, 뒤에 머리글이 보이는 `workout-editor`(390·768·1280)·`goal-editor`(4폭)·`machine-editor`(768·1280)입니다.
  - 확인: `dashboard-1280`을 이전 기준선과 나란히 보고, `body-360`도 직접 봤습니다. 주요 버튼 글자가 12px에서 14px로 커지고 머리글 간격이 바뀐 것 외에는 차이가 없었습니다.
  - 갱신: `visual-baselines` 아티팩트로 29장을 갱신했습니다. 다른 이미지는 기존 기준선과 바이트 단위로 같았습니다.

## main 병합

- 병합 직전 main에 #241(#125 종목 분석 모바일)이 들어와 `e2e/ui-touch.spec.ts`가 겹쳐 `origin/main`을 merge했습니다. 충돌은 없었고, 이 브랜치의 대상 선택자와 #241의 종목 분석 검사가 함께 남았습니다. 병합 뒤 `tsc -p e2e/tsconfig.json`, 관련 화면 테스트 통과
