# #103 머신 라이브러리 목록을 공통 컴포넌트로 교체 (2단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-machine-list`

## 목적

#103을 요소마다 나눠 옮기는 두 번째 PR입니다. 1단계(백업·내보내기, #225)에 이어 머신 라이브러리의 브랜드 탭과 목록을 옮깁니다. 페이지 머리글과 "머신 등록" 버튼은 #222 범위라 건드리지 않습니다. 남은 단계는 머신 등록·수정 폼과 공식 참고값, 신체 기록 추이와 기록 폼, 인바디 가져오기 미리보기 표, 마지막 `style.css` 정리입니다.

## 변경 — feat: 머신 목록 교체

- `frontend/src/app.tsx`
  - 브랜드 탭: `.brand-tabs` 버튼 줄을 `SegmentedControl`(이름 "브랜드")로 바꿨습니다. 항상 하나가 선택되는 탭이라 디자인 시스템의 `SegmentedControl` 용도에 맞습니다. 선택 상태를 `aria-checked`로 알리고, 현재 탭을 다시 눌러도 선택이 풀리지 않습니다.
  - 목록 카드: `section.card`와 `.section-title`을 운동 기록 카드(#101)와 같은 `Card`, `CardHeader`, `CardTitle`(h2), `CardDescription`으로 바꿨습니다.
  - 빈 상태: `.empty`를 공통 `EmptyState`(h3, 아이콘, 설명)로 바꿨습니다.
  - 행: `.workout-row`·`.machine-icon`·`.workout-info`를 `List`(이름 "머신")·`ListItem`(`data-slot="machine-row"`)과 유틸리티로 바꿨습니다. 아이콘 상자는 운동 기록 행의 날짜 상자와 같은 48px입니다. 공식 참고값 줄과 "출처" 링크는 유틸리티 글자와 밑줄 링크입니다.
  - "수정"은 `.text-button`에서 공통 `Button`(`ghost`, `sm`)으로 바꿨습니다. 이름은 그대로입니다.
- `frontend/src/style.css`: `.brand-tabs`, `.brand-tabs button`, `.brand-tabs .selected`, `.machine-icon`을 지우고, 끝의 대비 규칙 목록에서 `.machine-icon`을 뺐습니다. `.official-ref`는 등록·수정 폼(3단계)이 아직 써서 남깁니다. `.card`, `.section-title`, `.empty`, `.text-button`, `.workout-row`, `.workout-info`는 종목 분석·신체 기록이 아직 씁니다.
- 화면 차이: 브랜드 탭이 테두리 버튼 줄에서 회색 바탕의 탭 묶음이 되고, 목록 행이 운동 기록 행과 같은 간격·글자 크기가 됩니다.

## 테스트

- 추가: `frontend/src/official-weights.test.tsx`에 1개. 처음에 "전체 브랜드"가 선택돼 있는지, 브랜드를 고르면 그 탭만 선택되고("전체 브랜드" 해제) 머신이 없으면 빈 상태(h3)가 보이는지, 머신이 있는 브랜드를 고르면 그 머신이 남는지, 현재 탭을 다시 눌러도 선택이 남는지, "전체 브랜드"로 돌아오면 목록이 다시 보이는지 확인합니다.
- 수정: 같은 파일과 `machines.contract.test.tsx`의 `.workout-row` 선택자를 `data-slot="machine-row"`와 "머신" 목록 역할로, 브랜드 버튼 조회를 `radio` 역할로 바꿨습니다. 검증 내용은 같습니다.
- `npm run test -w frontend -- src/official-weights.test.tsx src/machines.contract.test.tsx src/forms.test.tsx src/rest-by-exercise.test.tsx src/routing.test.tsx`: 23 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. e2e(반응형·axe·터치·시각 기준선)는 PR CI로 확인합니다.

## 변경 — test: 1차 리뷰 보완

- 1차 리뷰는 필수 보완점이 없었고 선택 2건을 반영했습니다.
  - 새 테스트가 머신이 없는 브랜드만 골라, 탭 값(문자열)과 브랜드 id(숫자)의 비교가 깨져도 통과할 수 있었습니다. 머신이 있는 "Hammer Strength"를 골라 그 머신이 남는지 확인하는 단계를 넣었습니다.
  - 브랜드를 고르면 "전체 브랜드"가 해제되는지도 확인합니다.
- `npm run test -w frontend -- src/official-weights.test.tsx`: 7 pass

## 변경 — test: 시각 기준선 갱신

- 2차 리뷰는 보완점이 없었습니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.
- `42b6331`의 CI `e2e-visual`에서 시각 비교 6건만 실패했고 axe·반응형·터치 포함 72건은 통과했습니다. 바뀐 것은 `machines` 360·390·768·1280과, 뒤에 머신 목록이 보이는 `machine-editor` 768·1280입니다. `machines-360`·`machines-1280`·`machine-editor-1280`을 직접 보고 브랜드 탭 묶음, 목록 행 간격·글자, 모달 뒤 배경 외에 차이가 없음을 확인했습니다. 모달 자체는 그대로입니다. 그 뒤 `visual-baselines` 아티팩트로 6장을 갱신했습니다. 다른 이미지는 기존 기준선과 바이트 단위로 같았습니다.
- 한계: e2e 고정 데이터의 머신에는 공식 참고값이 연결돼 있지 않아 공식 참고값 줄과 "출처" 링크, 빈 상태는 이미지에 나오지 않습니다. 이 부분은 화면 테스트(`official-weights.test.tsx`)로만 확인했습니다.

## main 병합

- 병합 직전 main이 #229(#223 앱 위쪽 알림)만큼 앞서 있어 `origin/main`을 merge했습니다. 충돌은 없었습니다. 병합 뒤 `npm run test -w frontend -- src/official-weights.test.tsx src/machines.contract.test.tsx` pass, `npm run typecheck -w frontend` 통과
