# #102 루틴짜기의 12주 미리보기와 계획 보기를 공통 컴포넌트로 교체 (4단계)

- 이슈: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- 브랜치: `feat/102-routine-plan`
- 앞 단계: 1단계 [#227](https://github.com/sirloinbh/workout-memo/pull/227), 2단계 [#228](https://github.com/sirloinbh/workout-memo/pull/228), 3단계 루틴 폼 [#233](https://github.com/sirloinbh/workout-memo/pull/233)

## 목적

루틴짜기 화면에 마지막으로 남은 12주 예상 목표(`Preview`)와 저장한 루틴의 계획 보기를 공통 컴포넌트와 유틸리티로 옮기고, 루틴짜기 화면이 쓰던 `style.css` 규칙을 모두 지웁니다. 3단계(#233) 위에서 시작했고, #233 병합 뒤 `origin/main`을 받아 PR을 올립니다.

## 변경 — feat: 12주 미리보기와 계획 보기 교체

- `frontend/src/routines.tsx`
  - 12주 예상 목표: 테두리 상자(`data-slot="routine-preview"`) 안에 운동마다 기본 `details`·`summary`를 둡니다. `components/ui`에 펼침 부품이 없어 기본 요소를 유지하고 유틸리티를 붙였습니다. 터치 화면에서는 기존 규칙이 `summary` 높이를 44px 이상으로 두고, 글자 위아래 여백은 `pointer-coarse:py-3`으로 맞춥니다.
  - 디로딩 주차: 이전 `.deload` 클래스(스타일 규칙은 없었음) 대신 `data-deload` 속성과 진한 글자색으로 구분합니다. 계획 보기의 수동 주차 목표와 운동 일정에도 같은 표시를 붙였습니다.
  - 미리보기 제목: 루틴 폼 안에서는 h3(화면 h2 바로 아래), 계획 보기 안에서는 h4(루틴 이름 h3 아래)입니다. 이전에는 둘 다 h4라 폼 안에서 제목 단계가 건너뛰었습니다.
  - 미리보기 안내 문구(시작일·일정 입력 전)는 `bg-muted` 안내 상자입니다.
  - 계획 보기: 공통 `Card`(`role="region"`, 이름은 루틴 이름 제목에 `aria-labelledby`로 연결) 안의 `article`입니다. 루틴 이름은 `CardTitle`(h3), 분할·주차별 목표·운동 일정은 구분선이 있는 묶음과 h4입니다. 수동 루틴의 주차 목표에 "주차별 목표" 제목을 새로 붙였습니다. 운동 일정은 768px 이상에서 2단입니다.
  - 화면 루트는 `className="routine-page"` 대신 `data-slot="routine-page"`입니다.
- `frontend/src/style.css`: `.routine-page li`를 지웠습니다. 이제 루틴짜기 화면만 쓰는 규칙은 남지 않았습니다.

## 테스트

- 추가: `frontend/src/routines.test.tsx`에 1개. 계획 보기가 이름 있는 region이고 루틴 이름이 h3인지, 수동 루틴의 주차별 목표에서 4·8·12주차만 디로딩으로 표시되는지, 운동 일정 제목이 있는지 확인합니다.
- 기존 테스트(12주와 디로딩 표시, 자동 미리보기, 다시 열기)는 수정 없이 통과합니다.
- `npm run test -w frontend -- src/routines.test.tsx`: 9 pass
- `npm run typecheck -w frontend`, eslint·prettier(바꾼 파일): 통과
- 시각 기준선과 e2e는 PR CI로 확인합니다. PC 메모리가 부족해 로컬 전체 `npm run check`와 e2e는 돌리지 않았습니다.

## 변경 — fix: 1차 리뷰 보완

- 띄어쓰기 없는 긴 이름(루틴·분할 이름 최대 120자)이 360px나 2단 운동 일정에서 넘칠 수 있었습니다. 루틴 이름, 분할 이름, 운동 일정 줄에 `[overflow-wrap:anywhere]`를 붙였습니다.
- 터치 화면에서 `summary`의 `py-2` 유틸리티가 legacy 규칙의 `padding-block: 12px`를 이겨 글자가 위에 붙었습니다. `pointer-coarse:py-3`을 붙였고 위 기록의 설명도 고쳤습니다.
- 계획 보기 region의 이름을 고정 문구 "계획 보기" 대신 루틴 이름 제목(`aria-labelledby`)으로 바꿨습니다. 어느 루틴의 계획인지 함께 들립니다.
- 수동 주차 목표의 디로딩 표시를 미리보기·운동 일정과 같이 진한 글자색으로 맞췄습니다. 운동 일정의 디로딩이 아닌 날 끝에 남던 공백을 없앴습니다.
- `.routine-page li`를 지웠으므로 목록 항목의 `my-0`을 뺐습니다.
- 테스트: 계획 보기 테스트가 디로딩 주차를 `['4주차', '8주차', '12주차']`로 순서까지 비교하고, region 이름이 루틴 이름인지 봅니다. 자동 루틴으로 미리보기 제목이 계획 보기 안에서 h4, 루틴 폼 안에서 h3인지 확인하는 테스트를 더했습니다.
- 1차 보완 후: `npm run test -w frontend -- src/routines.test.tsx` 10 pass, eslint(바꾼 파일)·`npm run typecheck -w frontend` 통과.

## 2차 리뷰

- must-fix 없음. 1차 보완이 모두 맞게 들어갔음을 확인했습니다. 위 "계획 보기" 설명이 고정 이름으로 남아 있던 것을 고쳤습니다.
- 반영하지 않음: 새 h3/h4 테스트가 `document.querySelector('form')`으로 폼을 찾는다는 nit. 루틴짜기 화면의 폼은 이것 하나이고 폼에 접근성 이름이 없어, 이름으로 찾으려면 화면에 없는 이름을 새로 붙여야 합니다.
- 목록 간격(`.routine-page li` 삭제)은 CI 시각 기준선으로 확인합니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.

## main 병합

- 리뷰 뒤 main에 #236(인바디 미리보기, #103)이 병합됐습니다. 이 PR도 `style.css`를 바꾸므로 병합 규칙에 따라 `origin/main`을 병합했습니다. 충돌은 없었고, 병합 결과의 `style.css`는 main과 비교해 `.routine-page li` 삭제만 다릅니다.
- 병합 뒤: `npm run typecheck -w frontend` 통과, `npm run test -w frontend -- src/routines.test.tsx` 10 pass. 병합 전 `1057822`의 CI `e2e-visual`은 통과해 루틴짜기 기준선은 바뀌지 않았습니다(고정 데이터가 계획 보기를 열지 않음).
