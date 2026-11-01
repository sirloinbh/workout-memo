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

`frontend/src/components/`의 `segmented-control.test.tsx`, `toggle-chips.test.tsx`, `switch.test.tsx`, `number-input.test.tsx`, `list.test.tsx`가 역할·이름·상태·키보드 순서를 확인합니다.

## 검증

- 새 컴포넌트 테스트 5개 파일: 14 pass, 0 fail
- `npm run typecheck -w frontend`, `npm run lint`, `npm run format:check`: 통과
- `npm run knip`: 새 파일 관련 항목 없음. 기존 항목은 그대로 남아 있습니다(CI에서는 경고만).
- 로컬 `npm run check`: 완료하지 못했습니다. 시스템 메모리 부족으로 중단됐습니다. 전체 검사는 PR CI로 확인합니다.
- 화면 변경이 없어 브라우저 확인과 시각 기준선 갱신은 하지 않았습니다.

## 제한·후속

- 새 컴포넌트는 아직 어느 화면에도 쓰이지 않아, 다크 화면에서의 대비는 axe로 확인하지 못했습니다. 화면 교체(#101~#105)의 e2e에서 확인합니다.
