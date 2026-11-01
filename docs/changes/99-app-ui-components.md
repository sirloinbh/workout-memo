# #99 공통 컴포넌트에 없는 화면 요소 만들기

- 이슈: [#99](https://github.com/sirloinbh/workout-memo/issues/99)
- 브랜치: `feat/99-app-ui-components`

## 목적

화면 교체(#101~#105)에 필요한 요소 중 공통 컴포넌트에 없는 것을 준비합니다. #99 후보 중 Select, Card, Checkbox, Toast, EmptyState, Sheet는 #159 이후 `components/ui`에 있습니다.

## 변경 — feat: 앱 고유 컴포넌트

`frontend/src/components/`에 추가했습니다. `components/ui`는 중앙 관리 파일이라 넣을 수 없습니다. 새 npm 패키지는 없고, 이미 설치된 `radix-ui` 1.7.0의 ToggleGroup과 Switch를 씁니다.

- `SegmentedControl`: 하나 고르기. 현재 항목을 다시 눌러도 선택이 풀리지 않습니다.
- `ToggleChips`: 여러 개 고르기.
- `Switch`: 바로 적용되는 설정.
- `NumberInput`: − + 버튼과 입력란. `number-step.ts`의 `stepValue`가 소수 오차를 없애고 최소·최대에 맞춥니다.
- `List`, `ListItem`: 기록 목록.
- `docs/design-system.md`에 사용 예와 규칙을 적었습니다.

화면은 바꾸지 않았습니다. 이슈 범위대로 #101~#103에서 교체합니다. Combobox는 #124에서 필요하면 만듭니다.

## 테스트

`frontend/src/components/`의 `segmented-control.test.tsx`, `toggle-chips.test.tsx`, `switch.test.tsx`, `number-input.test.tsx`, `list.test.tsx`가 역할·이름·상태와 화살표 포커스 이동을 확인합니다. jsdom이라 실제 Tab 순서와 Space·Enter 동작은 확인하지 못합니다.

## 검증

- 새 컴포넌트 테스트 5개 파일: 19 pass, 0 fail
- `npm run typecheck -w frontend`, `npm run lint`, `npm run format:check`: 통과
- `npm run knip`: 새 파일 관련 항목 없음. 기존 항목은 그대로 남아 있습니다(CI에서는 경고만).
- 로컬 `npm run check`: 완료하지 못했습니다. 시스템 메모리 부족으로 중단됐습니다. 전체 검사는 PR CI로 확인합니다.
- 화면 변경이 없어 브라우저 확인과 시각 기준선 갱신은 하지 않았습니다.

## 변경 — fix: 1차 리뷰 보완

- `ToggleChips`: 결과를 클릭 순서가 아니라 `options` 순서로 돌려줍니다. 같은 부위 조합이 다른 배열로 저장되지 않습니다.
- `NumberInput`: `readOnly`이면 버튼도 막습니다. 한도의 버튼은 `aria-disabled`라 키보드 포커스를 잃지 않습니다. `aria-label`은 `label`로만 정하고, `inputMode`는 넘길 수 있습니다.
- 테스트: 한쪽 한도, 읽기 전용·비활성, 빈 값, 칩 순서와 화살표 이동을 추가했습니다.
- `docs/design-system.md`: `SegmentedControl`의 화살표는 포커스만 옮기고 Space·Enter로 고른다고 적었습니다.
- 반영하지 않은 지적: `List`의 `role="list"`는 린트 규칙 `jsx-a11y-x/no-redundant-roles`가 금지하고, VoiceOver 문제도 실제로 확인하지 못해 넣지 않았습니다. 지수 표기 입력, 범위 밖 값의 점프, `0x10` 입력은 kg·횟수에서 현실적인 문제가 아닙니다. `SegmentedControl`의 `disabled`, `aria-describedby`는 화면 교체에서 필요해지면 넣습니다.

## 리뷰

- 1차 리뷰: 위 "1차 리뷰 보완"으로 반영했습니다.
- 2차 리뷰: 보완점 없음. 분리한 이슈는 없습니다.

## 제한·후속

- 새 컴포넌트는 아직 어느 화면에도 쓰이지 않아, 다크 화면에서의 대비는 axe로 확인하지 못했습니다. 화면 교체(#101~#105)의 e2e에서 확인합니다.
