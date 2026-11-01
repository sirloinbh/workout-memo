# #104 터치 기기의 입력 글자와 누름 영역 맞추기

- 이슈: [#104](https://github.com/sirloinbh/workout-memo/issues/104)
- 브랜치: `fix/104-mobile-touch-targets`

## 목적

iOS는 입력 글자가 16px보다 작으면 포커스할 때 화면을 확대합니다. 기존 화면의 입력·버튼은 터치에 작았습니다(예: `.date-control input` 11px). 공통 컴포넌트는 이미 기준을 지킵니다.

사용자가 하단 탭 없이 진행하기로 정했습니다(이슈 코멘트, 중앙 `docs/layout.md`). 768px 미만의 내비게이션은 공통 Sheet 메뉴를 그대로 씁니다. 안전 영역과 `viewport-fit=cover`는 `AppShell`과 `index.html`에 이미 있습니다.

## 변경 — fix: 터치 기기 기준 적용

- `frontend/src/style.css`: 맨 끝에 `@media (pointer: coarse)` 규칙을 추가했습니다.
  - 입력·선택·여러 줄 입력: 글자 16px, 높이 44px 이상
  - 버튼: 높이·너비 44px 이상
  - `summary`와 체크박스가 든 `label`: 높이 44px 이상
- 터치 기기에만 적용하므로 터치 없이 찍는 시각 기준선은 바뀌지 않습니다.

## 테스트

- `e2e/ui-touch.spec.ts`(신규): 터치 에뮬레이션 360·390·768px에서 모든 페이지와 모달의 글자 크기, 누름 영역, 가로 넘침을 확인합니다. 메뉴의 `aria-current`와 페이지 이동도 확인합니다.
