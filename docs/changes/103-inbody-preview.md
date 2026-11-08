# #103 인바디 가져오기와 미리보기 표를 공통 컴포넌트로 교체 (5단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-inbody-preview`

## 목적

#103을 요소마다 나눠 옮기는 다섯 번째 PR입니다. 4단계(신체 기록 화면, #235)에 이어 신체 기록 화면의 "인바디 가져오기" 패널과 미리보기 표를 옮깁니다. 패널을 여는 버튼은 페이지 머리글(#222)이라 그대로입니다. 남은 단계는 `style.css` 정리(6단계)입니다.

## 변경 — feat: 인바디 가져오기 교체

- `frontend/src/inbody-import.tsx`
  - 패널: `section.card.inbody-import`를 `Card`(`role="region"`, 이름 "인바디 가져오기", 제목 h2)로 바꿨습니다. 테스트가 찾는 영역 이름은 그대로입니다.
  - 안내·파일 선택: `.form-hint`는 회색 상자 유틸리티, 파일 선택은 공통 `Label`과 `Input`(터치 16px 유지)입니다.
  - 오류: `.error`를 #223의 `AlertBanner`로, 저장 결과 문구를 공통 `Notice`로 바꿨습니다.
  - 열 고르기: `fieldset.form-grid`를 유틸리티 두 칸 배치로, 범례·라벨을 유틸리티와 `Label`로 바꿨습니다. 열 선택은 머신 폼과 같은 모양의 기본 `select`입니다.
  - 사진에서 읽은 글자: `details`/`pre`에 유틸리티를 줬습니다.
  - 미리보기 표: `.table-scroll`을 가로 스크롤 영역(`role="region"`, 이름 "인바디 미리보기", `tabIndex=0`)으로 바꿔 키보드로도 옆으로 넘길 수 있게 했습니다(#101의 12주 표와 같은 방식). 머리글 칸에 `scope="col"`을 붙였습니다. 행의 저장 체크박스는 공통 `Checkbox`이고, 머신 폼처럼 터치 화면에서 상자 16px·누름 영역 44px을 유지하는 className을 붙였습니다(중앙 수정 뒤 덮어쓰기 제거: sirloinbh/project-standards#415). 값 칸은 공통 `Input`이고, 숫자 칸 폭은 기존 90px 제한 대신 `w-24`(96px)입니다.
  - "선택한 N건 저장"은 공통 `Button`입니다.
- `frontend/src/style.css`: `.inbody-import`, `.inbody-import label`, `.inbody-import pre`, `.table-scroll`, `.inbody-preview input[type='number']`와 터치 화면의 `.inbody-preview input[type='checkbox']`를 지웠습니다. `.heading-actions`는 페이지 머리글(#222)이 아직 써서 남기고, 주석을 실제 용도에 맞게 고쳤습니다. 터치 규칙 `.legacy label:has(> input[type='checkbox'])`는 루틴짜기의 휴식 요일이 아직 써서 남깁니다.
- 화면 차이: 패널이 공통 카드 모양이 되고, 표에 테두리와 머리글 바탕이 생깁니다. 오류가 테두리 있는 경고 상자로 보입니다.

## 테스트

- 추가: `frontend/src/inbody-import.test.tsx`에 2개.
  - 미리보기: 패널 제목(h2), 표가 이름 있는 스크롤 영역 안에 있고 `tabindex=0`인지, 머리글 칸 순서, 행 저장 `checkbox`를 끄면 "선택한 0건 저장"이 비활성되고 다시 켜면 저장되는지, 저장 결과가 `status`로 알려지고 행에 "저장함"이 남는지 확인합니다.
  - 오류: 측정값 줄이 없는 CSV를 고르면 패널 안에 `alert`가 뜨고 표가 생기지 않는지 확인합니다.
- 기존 3개는 라벨 이름(`getByLabelText`)이 같아 그대로 통과합니다. 공통 `Checkbox`도 `aria-label`로 찾고 `toBeChecked`·`toBeDisabled`가 그대로 동작합니다.
- `npm run test -w frontend -- src/inbody-import.test.tsx src/body.test.tsx`: 교체 직후 11 pass, 테스트 추가 뒤 `inbody-import.test.tsx` 5 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 한계: e2e 고정 화면은 인바디 패널을 열지 않아, 이 패널은 시각 기준선·터치·axe 검사 대상이 아닙니다. 화면 테스트로만 확인합니다. 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다.
