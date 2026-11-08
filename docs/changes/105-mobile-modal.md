# #105 모바일 입력 흐름 최적화 2단계: 모바일 모달·저장 버튼 하단 고정·키보드 가림

- 이슈: [#105](https://github.com/sirloinbh/workout-memo/issues/105)
- 브랜치: `feat/105-mobile-modal`
- 앞 단계: [1단계 세트 카드](105-set-cards.md)(#232)

## 목적

휴대폰에서 일지를 쓸 때 저장 버튼을 찾으러 긴 폼 끝까지 내려가지 않게 하고, 화면 키보드가 입력 중인 칸과 저장 버튼을 가리지 않게 합니다.

## 변경 — feat: 모바일 모달과 저장 버튼 하단 고정

- `frontend/src/components/modal.tsx`
  - `Modal`에 `layout`을 추가했습니다. 640px(`sm`) 미만에서만 모양이 바뀌고, 그 이상은 지금처럼 가운데 카드입니다.
    - `sheet`(기본): 화면 아래에 붙는 하단 시트입니다. 위쪽 모서리만 둥글고 너비는 화면 전체입니다. 목표·머신 폼처럼 짧은 폼에 씁니다.
    - `full`: 화면 전체를 채웁니다. 일지 편집에 씁니다.
  - 두 모양 모두 아래 끝이 `--keyboard-inset`(화면 키보드가 덮는 높이)에서 멈춥니다. `visualViewport`의 `resize`·`scroll`을 받아 이 값을 바꾸고, 키보드가 올라와 모달이 짧아지면 입력 중인 칸을 `scrollIntoView({ block: 'nearest' })`로 다시 보이게 합니다. iOS와 Android Chrome 모두 키보드가 뜨면 화면 전체(layout viewport)는 그대로 두고 보이는 영역(visual viewport)만 줄이므로, 그 차이를 키보드 높이로 봅니다.
  - 모달 스크롤 영역에 `scroll-padding-bottom`(96px)을 줘서 브라우저가 칸을 스크롤해 보여 줄 때 하단 저장 버튼 뒤에 숨지 않게 했습니다.
  - 새 `ModalFooter`: 모달 아래 끝에 붙어 있는(`sticky bottom-0`) 영역입니다. 위쪽 경계선과 배경이 있어 폼이 그 뒤로 지나갑니다. 아이폰 홈 표시줄 영역(`safe-area-inset-bottom`)만큼 아래 여백을 둡니다.
  - 공통 `components/ui/dialog.tsx`는 중앙 관리 파일이라 고치지 않고, `Modal`이 넘기는 클래스로만 바꿨습니다.
- `frontend/src/components/keyboard-inset.ts`: 키보드 높이 계산 `keyboardInset(innerHeight, visualViewport)`. 보이는 영역 아래로 가려진 높이만 셉니다(보이는 영역이 위로 밀린 `offsetTop`은 빼고, 음수는 0).
- `frontend/src/app.tsx`: 일지 편집 모달을 `layout="full"`로 열고, "기록 저장하기" 버튼을 `ModalFooter`에 넣었습니다.
- 화면 차이: 640px 미만에서 일지 편집은 전체 화면, 목표·머신 폼은 하단 시트가 됩니다. 일지 편집의 저장 버튼은 폼을 스크롤하는 동안 화면 아래에 계속 보입니다. 768px 이상은 모달 모양이 그대로이고, 일지 편집만 저장 버튼이 모달 아래에 붙습니다(1차 리뷰 보완 참고).

## 테스트

- 추가: `frontend/src/components/modal.test.tsx` 3개
  - `keyboardInset`이 키보드 없음·키보드 336px·보이는 영역이 위로 밀린 경우·음수에서 맞는 값을 내는지
  - `visualViewport`가 줄면 모달의 `--keyboard-inset`이 바뀌고 입력 중인 칸을 다시 보여 주는지, 닫으면 이벤트를 떼는지
  - 기본 모양이 `sheet`이고 `ModalFooter`가 대화상자 안에 있는지
- 추가: `e2e/ui-responsive.spec.ts`의 "390px 모바일 모달" 2개. 일지 편집이 390×844 전체를 채우고 저장 버튼이 처음·가운데·맨 위로 스크롤한 상태 모두에서 화면 아래 80px 안에 보이는지, 목표 폼이 화면 아래에 붙은 전체 너비 시트인지 확인합니다. CI에서 실행합니다.
- `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx src/set-completion.test.tsx src/forms.test.tsx`: 39 pass
- `npm run typecheck -w frontend`, 바뀐 파일 eslint(`--max-warnings 0`)·prettier: 통과
- 실행하지 않은 것: e2e와 로컬 `npm run check`는 메모리 부족으로 돌리지 않았습니다. 시각 기준선·axe·반응형·터치는 PR CI로 확인합니다. 실제 휴대폰 키보드로는 확인하지 못했습니다(Playwright는 화면 키보드를 띄우지 않습니다). 키보드 동작은 위 단위 테스트의 `visualViewport` 흉내로만 검증했습니다.
- 예상 기준선 변화: 1차 리뷰 보완에서 고쳤습니다.

## 변경 — fix: 1차 리뷰 보완

1차 리뷰는 필수 1건, 권장 3건이었고 모두 반영했습니다.

- 필수 1: `ModalFooter`는 화면 폭과 관계없이 적용되는데, 기록에는 "768px 이상은 바뀌지 않는다", 예상 기준선은 6장이라고 적었습니다. 768·1280px에서도 일지 편집 폼이 모달보다 길어서 저장 버튼이 모달 아래에 붙습니다. 데스크톱에서도 끝까지 내려가지 않고 저장할 수 있어 의도한 동작으로 두고, 기록을 고쳤습니다. 예상 기준선 변화는 8장입니다: 360·390px의 `workout-editor`·`goal-editor`·`machine-editor` 6장과 768·1280px의 `workout-editor` 2장.
- 권장 2: 핀치 확대도 보이는 영역을 줄이고, 확대한 채 화면을 옮기면 `offsetTop`이 바뀝니다. 그래서 확대만 해도 키보드로 오인해 모달 높이가 흔들리고 `scrollIntoView`가 되풀이됐습니다. `visualViewport.scale`이 1.01을 넘으면 키보드 높이를 0으로 봅니다.
- 권장 3: 단위 테스트가 `scroll` 리스너 해제도 확인합니다.
- 권장 4: e2e 좌표 비교를 모두 `toBeCloseTo(…, 0)`로 바꿔 소수 픽셀에 흔들리지 않게 했습니다.
- 추가 테스트: `keyboardInset`에 확대(`scale: 2`) 1건
- 보완 후: `npm run test -w frontend -- --maxWorkers=1 src/components/modal.test.tsx src/workout-draft.test.tsx` 27 pass, typecheck·eslint·prettier 통과
