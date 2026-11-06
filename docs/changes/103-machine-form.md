# #103 머신 등록·수정 폼과 공식 참고값을 공통 컴포넌트로 교체 (3단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-machine-form`

## 목적

#103을 요소마다 나눠 옮기는 세 번째 PR입니다. 2단계(머신 목록, #230)에 이어 머신 등록·수정 모달의 입력과 공식 참고값 안내를 옮깁니다. 모달 틀(`Modal`)은 이미 공통 Dialog 래퍼라 그대로 둡니다. 남은 단계는 신체 기록 추이와 기록 폼, 인바디 가져오기 미리보기 표, 마지막 `style.css` 정리입니다. 백업 화면의 실패·경고 문구를 `AlertBanner`로 바꾸는 일은 조율 창 요청대로 6단계에 넣습니다.

## 변경 — feat: 머신 폼 교체

- `frontend/src/app.tsx`(머신 편집 모달)
  - 라벨: legacy `<label>`을 공통 `Label`과 나의 목표 폼(#102)의 `fieldLabel`(위에 라벨, 아래에 입력)로 바꿨습니다. 오류 문구(`FieldError`)는 그대로 라벨 밖입니다.
  - 머신 이름·기본중량: 공통 `Input`에 터치 16px 유지(`touchText`)를 붙였습니다.
  - 브랜드·공식 참고값: 브라우저 기본 `select`를 두고 공통 `Input`과 같은 모양의 `selectField` 유틸리티를 줬습니다. 공통 `Select`(Radix)는 값을 고르는 방식이 달라 화면 테스트의 `selectOptions`를 모두 바꿔야 합니다(#101 세트 행과 같은 판단).
  - 확인 자료 메모: 공통 `components/ui`에 `Textarea`가 없어, 같은 모양의 `textareaField` 유틸리티를 준 기본 `textarea`입니다.
  - 단관절 운동 머신: 기본 체크박스를 공통 `Checkbox`와 `Label htmlFor`로 바꿨습니다. 폼과 함께 저장하는 값이라 디자인 시스템 규칙대로 `Switch`가 아니라 `Checkbox`입니다.
  - 안내 문단(`.form-hint` 3곳): 나의 목표 폼의 안내와 같은 `formHint` 유틸리티(회색 바탕 상자)로 바꿨습니다.
  - 공식 참고값 안내(`div.official-ref`, `role="note"`): 테두리 있는 회색 상자 유틸리티로 바꾸고, 문단마다 글자 유틸리티를, "제조사 공식 출처" 링크에 밑줄을 줬습니다.
- `frontend/src/style.css`: `.official-ref`, `:where(.legacy) div.official-ref`, `div.official-ref p`, `.modal .rest-auto`, `.modal .rest-auto input`을 지우고, 끝의 대비 규칙에서 `div.official-ref`를 뺐습니다. `.form-hint`는 종목 분석·신체 기록·인바디·루틴짜기·일지 편집이, `.modal label/input/select/textarea`는 일지 편집(#105 범위)이 아직 써서 남깁니다.
- 화면 차이: 라벨 글자가 11px에서 12px로, 입력이 공통 `Input` 높이(36px, 터치 44px)로 바뀝니다. 체크박스가 공통 모양이 되고, 공식 참고값 상자 안의 줄 간격이 좁아집니다. 공식 참고값 제목은 12px에서 14px로, 상자 아래 여백은 12px에서 16px로 바뀝니다.

## 테스트

- 추가: `frontend/src/official-weights.test.tsx`에 1개. 브랜드·공식 참고값(`combobox`), 머신 이름·메모(`textbox`), 기본중량(`spinbutton`), 단관절(`checkbox`)이 모두 이름으로 찾아지는지, 보이는 라벨을 눌러도 체크박스가 켜지는지, 저장 요청에 메모와 `single_joint: true`가 들어가는지 확인합니다.
- 기존: 공식 참고값 연결·브랜드 변경(`official-weights.test.tsx`), 브랜드 필수(`forms.test.tsx`), 단관절 저장(`rest-by-exercise.test.tsx`)이 라벨 구조가 같아 그대로 통과합니다.
- `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx src/forms.test.tsx src/machines.contract.test.tsx`: 18 pass, 테스트 추가 뒤 `official-weights.test.tsx` 8 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. e2e(반응형·axe·터치·시각 기준선)는 PR CI로 확인합니다.

## 변경 — fix: 1차 리뷰 보완

- 터치 체크박스 크기(필수): 공통 `Checkbox`는 `<button role="checkbox">`라 `style.css` 끝의 터치 규칙 `.legacy button { min-width: 44px; min-height: 44px }`에 걸려 44px 네모로 커졌습니다. `Switch`처럼 `pointer-coarse:min-h-4 pointer-coarse:min-w-4`를 붙여 상자는 16px로 두고, 공통 `Checkbox`의 `::after` 영역(44px)으로 누르게 했습니다.
- `e2e/ui-touch.spec.ts`: 기존 검사는 체크박스를 일반 버튼으로 보고 44px이면 통과시켜 이 문제를 잡지 못했습니다. `[role="checkbox"]`를 버튼 검사에서 빼고 스위치처럼 `::after` 누름 영역이 44×44px 이상인지 보며, 상자 자체가 24px보다 커지면 실패하게 했습니다.
- 선택: 공식 참고값 제목과 상자 여백의 크기 변화를 위 "화면 차이"에 적었습니다.
- 선택(6단계로 미룸): `selectField`·`textareaField`(app.tsx)와 백업 화면의 `nativeSelect`가 거의 같은 문자열입니다. 신체 기록·인바디 화면에도 같은 select가 있어, 6단계 정리에서 한 곳으로 모읍니다.
- `npm run test -w frontend -- src/official-weights.test.tsx src/rest-by-exercise.test.tsx`: 15 pass. `tsc -p e2e/tsconfig.json`, eslint, prettier: 통과. 터치 e2e는 PR CI로 확인합니다.
