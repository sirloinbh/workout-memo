# #101 체감 피드백을 ToggleChips로 교체 (4단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-feedback-chips`

## 목적

#101을 요소 하나씩 나눠 옮기는 네 번째 PR입니다. `.tabs`를 쓰던 마지막 요소인 체감 피드백을 `ToggleChips`로 바꾸고 `.tabs` 규칙을 지웁니다. 이 PR은 #101을 닫지 않습니다.

## 변경 — feat: 체감 피드백 교체

- `frontend/src/app.tsx`: 일지 편집의 체감 피드백을 `ToggleChips`로 바꿨습니다. 하나만 고르는 규칙은 호출 쪽에서 지킵니다. 다른 값을 누르면 바뀌고, 고른 값을 다시 누르면 해제됩니다. 전과 같습니다.
- 그룹 이름은 `체감 피드백 (선택)`에서 `체감 피드백`으로 바뀝니다. 각 칩의 `aria-pressed`는 그대로입니다. 칩 사이는 화살표로 이동합니다.
- `frontend/src/style.css`: `.tabs`, `.feedback-field`와 관련 반응형, 대비 규칙을 지웠습니다.
- `docs/design-system.md`: `ToggleChips`의 이 사용법을 적었습니다.
- 모양이 탭에서 둥근 칩으로 바뀌고, 고른 칩은 주 색 바탕입니다.

## 변경 — fix: 1차 리뷰 보완

- 포커스 표시: 다크에서 `ring/50`은 대비가 약 1.9:1(리뷰 계산)이라 키보드 포커스가 잘 보이지 않습니다. `ToggleChips`, `SegmentedControl`, `Switch`를 `ring-ring`으로 바꿨습니다. 대비는 약 4:1로 3:1 기준을 넘습니다(토큰 값으로 계산, 화면으로는 재지 않음).
- 중앙 공통 컴포넌트(`Button` 등)도 `ring/50`을 씁니다. 중앙 관리 파일이라 여기서 고치지 않았습니다.
- 저장 중에는 Radix 묶음의 `tabIndex=0` 때문에 Tab이 보이지 않는 곳에 한 번 멈출 수 있습니다. 값은 바뀌지 않아 그대로 뒀습니다.
- 쓸모없어진 `style.css` 주석을 지웠습니다.

## 테스트

- `frontend/src/set-completion.test.tsx`: 다른 값을 누르면 하나만 남는 검증을 추가했습니다.
- 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다. e2e와 시각 기준선은 PR CI로 확인합니다.
