# 디자인 시스템

workout-memo는 8개 앱 공통 디자인 시스템을 씁니다(#159, 중앙 project-standards #126). 공통 규칙의 원본은 중앙 리포의 `docs/design-system.md`, `docs/ui-components.md`, `docs/layout.md`, `docs/pwa.md`입니다. 이 문서는 workout-memo에만 있는 것을 적습니다.

## UI 기준 결정 (#98)

사용자가 2026-10-30에 정했습니다. 다크 전용은 #184에서 적용했습니다. 사용자가 다크 화면만 쓰기로 해, 모든 화면과 화면 검사의 기준은 다크 하나입니다.

| 항목            | 결정                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------- |
| 컴포넌트 기준   | shadcn/ui + Radix(`radix-ui` 1.7.0). 공통 컴포넌트 17개가 `frontend/src/components/ui`에 있습니다 |
| 탈락한 후보     | Base UI, Ark UI, 직접 작성. 8개 앱 공통 기준을 따르기로 해 고르지 않았습니다                      |
| 디자인 톤       | 다크 모드만 씁니다. 색은 공통 다크 토큰(바탕 `#0a0a0a`, 카드 `#171717`)을 그대로 씁니다           |
| 라이트·시스템   | 선택지를 없앴습니다. 중앙 레지스트리 `features.darkOnly`로 고정합니다(중앙 ADR-0011)              |
| 새 npm 패키지   | 사용자가 도입을 허용했지만, 필요한 패키지가 이미 설치돼 있어 새로 들일 것이 없습니다              |
| Preflight(#100) | #159에서 Tailwind CSS 4와 함께 켜졌습니다                                                         |
| 대표 화면 시안  | 따로 만들지 않습니다. #184의 시각 기준선으로 확인합니다                                           |

컴포넌트 목록은 중앙 `docs/ui-components.md`, 글자·대비 기준은 중앙 `docs/design-system.md`, 레이아웃은 중앙 `docs/layout.md`가 원본입니다. 공통 컴포넌트에 없는 것을 만드는 방법도 중앙 `docs/design-system.md`의 "컴포넌트" 절을 따릅니다.

이 기준을 적용하는 이슈는 다음과 같습니다. 결정 코멘트에는 project-standards#354, #184, #101~#104가 있고, #99와 #105는 각 이슈의 의존성에 #98 또는 #104가 적혀 있어 함께 적었습니다.

| 이슈                  | 내용                                       |
| --------------------- | ------------------------------------------ |
| project-standards#354 | 앱별 다크 모드 고정 옵션. #184의 선행 조건 |
| #184                  | 다크 전용 적용과 화면 검사 다크 기준       |
| #99                   | 공통 컴포넌트 확장                         |
| #101·#102·#103        | 화면별 공통 컴포넌트 교체                  |
| #104·#105             | 모바일 레이아웃과 입력 흐름                |

## 구성

| 파일                                        | 관리 | 역할                                                                                        |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `frontend/src/index.css`                    | 앱   | Tailwind CSS 4, `tw-animate-css`, `@sirloinbh/design-tokens`(흑백 라이트·다크, Pretendard)  |
| `frontend/src/style.css`                    | 앱   | 전환 전부터 있던 페이지 스타일. `components` 레이어에 들어가고, 색은 공통 토큰만 참조       |
| `frontend/src/components/ui/`               | 중앙 | shadcn/ui 공통 컴포넌트(Button, Dialog, Sheet 등). 직접 고치지 않음                         |
| `frontend/src/components/layout/`           | 중앙 | `AppShell`(상단 바, 주 메뉴, 본문, footer). 화면 모드 메뉴는 다크 전용이라 그리지 않음      |
| `frontend/src/lib/utils.ts`, `lib/theme.ts` | 중앙 | `cn()`, 화면 모드 적용. `lib/theme-config.ts`의 `DARK_ONLY`로 항상 다크                     |
| `frontend/public/theme-init.js`             | 중앙 | 첫 화면 전에 다크 적용(깜빡임 방지). 저장값은 무시                                          |
| `frontend/src/components/modal.tsx`         | 앱   | `Modal`: 공통 Dialog를 `title`·`close`로 여는 앱 래퍼. 내용은 `.legacy .modal` 폼 스타일    |
| `frontend/src/components/field.tsx`         | 앱   | `Input`, `FieldError`, `invalidProps(name, message)`: 오류 문구와 입력란 연결               |
| `frontend/src/components/form-styles.ts`    | 앱   | 폼 공통 클래스(#103): `fieldLabel`, `touchText`, `selectField`, `textareaField`, `formHint` |

## 앱 고유 컴포넌트 (#99)

공통 컴포넌트에 없어 `frontend/src/components/`에 만들었습니다. 여러 앱에 필요해지면 중앙 리포로 옮깁니다. 화면 교체(#101~#105)에서 씁니다.

| 컴포넌트           | 언제 쓰나                                                                                             | 규칙과 키보드·접근성                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SegmentedControl` | 몇 개 중 항상 하나: 기간 탭                                                                           | `label`이 그룹 이름입니다. 항상 하나가 선택되며, 현재 항목을 다시 누르면 `onReselect`만 부릅니다. 해제가 되는 체감 피드백에는 쓰지 않습니다. Tab은 선택 항목으로 들어갑니다. 화살표는 포커스만 옮기고 Space·Enter로 고릅니다 |
| `ToggleChips`      | 여러 개 선택(없어도 됨): 부위 지정. 해제가 되는 한 개 선택(체감 피드백)은 호출 쪽에서 하나만 남깁니다 | 칩마다 `aria-pressed`로 상태를 알립니다. 화살표로 이동하고 Space·Enter로 켜고 끕니다                                                                                                                                         |
| `Switch`           | 바로 적용되는 설정: 휴식 타이머 자동 시작                                                             | `Label`의 `htmlFor`로 이름을 답니다. 폼과 함께 저장하는 값은 공통 `Checkbox`를 씁니다. 터치 기기에서 누름 영역이 넓습니다                                                                                                    |
| `NumberInput`      | 한 손으로 넣는 kg·횟수                                                                                | `label`이 입력과 − + 버튼의 이름입니다. 값은 문자열이고 검증은 폼과 서버가 합니다. 소수 `step`이면 소수 키패드를 엽니다. 정수 `step`인데 소수를 받는 값은 `inputMode="decimal"`을 넘깁니다                                   |
| `List`, `ListItem` | `Card` 안의 기록 목록                                                                                 | `List`에 `aria-label`을 답니다. 행 사이에 구분선이 있고 행 높이는 44px 이상입니다                                                                                                                                            |

`StatCard`(#101)는 `Card` 위에 만든 요약 숫자 카드입니다. 라벨, 값과 단위, 짧은 설명을 받습니다.

`PageHeader`(#222)는 페이지 맨 위의 머리글입니다. eyebrow, `h1`(끝의 흐린 점 포함), 설명, 주요 버튼 자리(`actions`)를 받습니다. 버튼은 공통 `Button`을 넣고, 폰에서는 글 아래로, `md`부터는 오른쪽에 놓입니다.

```tsx
<SegmentedControl label="기간" options={periods} value={period} onValueChange={setPeriod} />
<NumberInput label="중량" value={weight} onValueChange={setWeight} step={2.5} min={0} />
```

## 규칙

1. 새 화면 요소는 `components/ui`의 공통 컴포넌트를 먼저 씁니다. 모달은 `Modal`, 폼 오류는 `invalidProps`와 `FieldError`입니다.
2. 색은 공통 토큰 이름만 씁니다(`bg-primary`, `text-muted-foreground`, CSS에서는 `var(--primary)`). 색 코드를 직접 쓰지 않고, 토큰을 앱에서 덮어쓰지 않습니다.
3. `style.css`의 요소 규칙(`button`, `p`, `h1` 등)은 `.legacy` 안에서만 적용됩니다. 페이지 본문과 `Modal` 내용이 `.legacy`이고, 공통 셸과 공통 컴포넌트는 영향을 받지 않습니다.
4. `style.css`는 `components` 레이어라 같은 속성이면 Tailwind 유틸리티가 이깁니다. 기존 화면을 유틸리티와 공통 컴포넌트로 옮기면 해당 `style.css` 규칙을 지웁니다.
5. `style.css` 끝의 대비 규칙은 라이트 모드 때 만들었습니다. 다크에서도 axe 검사를 통과해 그대로 두며, 화면을 공통 컴포넌트로 옮길 때 함께 지웁니다. 새 바탕을 위해 이 규칙을 늘리지 않습니다.
6. 오류 문구는 `<label>` 밖에 두어 입력란의 접근성 이름을 바꾸지 않습니다.
