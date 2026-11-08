# #103 신체 기록 화면의 추이·기록 폼·목록을 공통 컴포넌트로 교체 (4단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-body-records`

## 목적

#103을 요소마다 나눠 옮기는 네 번째 PR입니다. 1~3단계(백업 #225, 머신 목록 #230, 머신 폼 #231)에 이어 신체 기록 화면의 오류·상태 문구, 기록 폼, 지표별 추이 그래프, 기록 목록을 옮깁니다. 페이지 머리글(`.page-heading`)과 그 안의 "인바디 가져오기"·"신체 기록 추가" 버튼은 #222 범위라 그대로 둡니다. 남은 단계는 인바디 가져오기 미리보기 표(5단계)와 `style.css` 정리(6단계)입니다.

## 변경 — feat: 신체 기록 화면 교체

- `frontend/src/body.tsx`
  - 불러오기 실패: `.error`를 #223의 `AlertBanner`로 바꾸고 "다시 연결"을 그 `action` 자리의 `Button`(`outline`, `sm`)으로 옮겼습니다.
  - 저장·삭제 완료 문구: 맨 `p role="status"`를 공통 `Notice`로 바꿨습니다.
  - 기록 폼: `form.card.body-form`을 `Card`(제목 h2)로 감쌌습니다. 폼 오류는 `AlertBanner`입니다. 입력은 나의 목표·머신 폼과 같은 `Label`(+`fieldLabel`)과 공통 `Input`(터치 16px 유지)입니다. 두 칸 배치는 `.form-grid` 대신 유틸리티이고, 터치 폰(480px 이하)에서는 한 칸입니다. 안내는 회색 상자 유틸리티이고, "신체 기록 저장"·"취소"는 공통 `Button`입니다. 체중·체지방률·골격근량은 소수 값이라 −/+ 버튼이 있는 `NumberInput` 대신 공통 `Input`을 씁니다.
  - 추이 그래프: `.body-trends`·`.body-trend*` 규칙을 그림 요소의 유틸리티로 옮겼습니다. 선·점 색은 `stroke-primary`·`fill-primary` 토큰입니다. 그래프 이름(`role="img"`, `aria-label`)은 그대로입니다.
  - 기록 목록: `section.card`·`.section-title`·`.count`·`.empty`·`.workout-row`를 운동 기록·머신 목록과 같은 `Card`·`Badge`·`EmptyState`(h3)·`List`("신체 기록")·`ListItem`으로 바꿨습니다. 수정·삭제는 공통 `Button`(`ghost`, `sm`)이고 이름("날짜 신체 기록 수정/삭제")은 그대로입니다.
- `frontend/src/style.css`: `.body-form`, `.body-form fieldset`, `.body-trends`, `.body-trend-missing`, `.body-trend`와 그 아래 `figcaption`·`svg`·`polyline`·`circle` 5개 규칙, `.body-trend-axis`, `.body-list`와 `.body-trends`의 760px 미디어 규칙을 지웠습니다. `.form-grid`(일지 편집·인바디·루틴짜기), `.heading-actions`·`.subtle-button`(페이지 머리글, #222), `.card`·`.workout-row` 등은 다른 화면이 아직 써서 남깁니다.
- 화면 차이: 기록 폼과 목록이 다른 화면의 카드와 같은 간격·글자 크기가 됩니다. 그래프 축 글자는 9px에서 12px로, 그래프 제목줄과 안내 상자 글자는 11px에서 12px로 커지고, 그래프 3개가 한 줄이 되는 폭은 761px에서 `md`(768px)입니다.

## 테스트

- 추가: `frontend/src/body.test.tsx`에 1개. 목록 카드 제목이 개수와 함께 읽히는지("신체 기록 4"), 목록 행 제목(h3)이 날짜 역순인지, 수정 버튼 이름, 폼 제목과 지표 칸 이름(`spinbutton`), 빈 폼 저장이 `alert`로 거부되는지, 저장 뒤 `status`가 알리고 폼이 닫히는지, "취소"가 저장 없이 폼을 닫는지 확인합니다.
- 수정: 같은 파일의 `.body-list > li` 선택자를 "신체 기록" 목록 역할로 바꿨습니다. 검증 내용은 같습니다.
- `npm run test -w frontend -- src/body.test.tsx src/inbody-import.test.tsx`: 교체 직후 10 pass, 테스트 추가 뒤 `body.test.tsx` 8 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있어 실행하지 않았습니다. e2e(반응형·axe·터치·시각 기준선)는 PR CI로 확인합니다.

## 변경 — test: 시각 기준선 갱신

- 1차 리뷰는 필수 보완점이 없었습니다. 선택 2건(지운 규칙 개수, 화면 차이 보강)은 문서라 이 커밋에서 반영했습니다. 코드 보완이 없어 2차 리뷰는 하지 않습니다.
- `ca3938f`의 CI `e2e-visual`에서 `body` 360·390·768·1280 4건만 실패했고, axe·반응형·터치를 포함한 77건은 통과했습니다. 360·1280 이미지를 직접 보고 추이 카드, 안내 상자, 목록 카드·행 외에 차이가 없음을 확인했습니다. 페이지 머리글은 그대로입니다. 그 뒤 `visual-baselines` 아티팩트로 4장을 갱신했습니다. 다른 이미지는 기존 기준선과 바이트 단위로 같았습니다.
- 한계: e2e 고정 데이터에는 빈 기간·불러오기 실패·열린 기록 폼이 없어 빈 상태, `AlertBanner`, 폼은 이미지에 나오지 않습니다. 이 부분은 화면 테스트(`body.test.tsx`)로만 확인했습니다.
