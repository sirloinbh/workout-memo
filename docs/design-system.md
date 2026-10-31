# 디자인 시스템

workout-memo는 8개 앱 공통 디자인 시스템을 씁니다(#159, 중앙 project-standards #126). 공통 규칙의 원본은 중앙 리포의 `docs/design-system.md`, `docs/ui-components.md`, `docs/layout.md`, `docs/pwa.md`입니다. 이 문서는 workout-memo에만 있는 것을 적습니다.

## UI 기준 결정 (#98)

사용자가 2026-10-30에 정했습니다.

| 항목           | 결정                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 컴포넌트 기준  | shadcn/ui + Radix(`radix-ui` 1.7.0). 8개 앱 공통 기준을 따릅니다                         |
| 탈락한 후보    | Base UI, Ark UI, 직접 작성. 8개 앱 공통 기준과 달라서 고르지 않았습니다                  |
| 디자인 톤      | 다크 모드만 씁니다. 색은 공통 다크 토큰(바탕 `#0a0a0a`, 카드 `#171717`)을 그대로 씁니다  |
| 라이트·시스템  | 선택지를 없앱니다. 적용은 #184에서 하며, 중앙 project-standards#354가 먼저 끝나야 합니다 |
| 새 npm 패키지  | 없습니다. 필요한 패키지가 이미 설치돼 있습니다                                           |
| Preflight      | #159에서 Tailwind CSS 4와 함께 켜졌습니다                                                |
| 대표 화면 시안 | 따로 만들지 않습니다. #184의 시각 기준선으로 확인합니다                                  |

컴포넌트 목록, 글자·간격·대비 기준, 화면 패턴의 원본은 위 중앙 문서입니다. 공통 컴포넌트에 없는 것은 `frontend/src/components/`에 앱 고유로 만들고, 여러 앱에 필요해지면 중앙 리포에 이슈를 엽니다.

이 기준을 적용하는 작업 단위는 다음과 같습니다.

| 이슈           | 내용                                 |
| -------------- | ------------------------------------ |
| #184           | 다크 전용 적용과 화면 검사 다크 기준 |
| #99            | 공통 컴포넌트에 없는 요소 만들기     |
| #101·#102·#103 | 화면별 공통 컴포넌트 교체            |
| #104·#105      | 모바일 레이아웃과 입력 흐름          |

## 구성

| 파일                                        | 관리 | 역할                                                                                       |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| `frontend/src/index.css`                    | 앱   | Tailwind CSS 4, `tw-animate-css`, `@sirloinbh/design-tokens`(흑백 라이트·다크, Pretendard) |
| `frontend/src/style.css`                    | 앱   | 전환 전부터 있던 페이지 스타일. `components` 레이어에 들어가고, 색은 공통 토큰만 참조      |
| `frontend/src/components/ui/`               | 중앙 | shadcn/ui 공통 컴포넌트(Button, Dialog, Sheet 등). 직접 고치지 않음                        |
| `frontend/src/components/layout/`           | 중앙 | `AppShell`(상단 바, 주 메뉴, 본문, footer), 화면 모드 메뉴                                 |
| `frontend/src/lib/utils.ts`, `lib/theme.ts` | 중앙 | `cn()`, 화면 모드 저장·적용                                                                |
| `frontend/public/theme-init.js`             | 중앙 | 첫 화면 전에 저장한 화면 모드 적용(깜빡임 방지)                                            |
| `frontend/src/components/modal.tsx`         | 앱   | `Modal`: 공통 Dialog를 `title`·`close`로 여는 앱 래퍼. 내용은 `.legacy .modal` 폼 스타일   |
| `frontend/src/components/field.tsx`         | 앱   | `Input`, `FieldError`, `invalidProps(name, message)`: 오류 문구와 입력란 연결              |

## 규칙

1. 새 화면 요소는 `components/ui`의 공통 컴포넌트를 먼저 씁니다. 모달은 `Modal`, 폼 오류는 `invalidProps`와 `FieldError`입니다.
2. 색은 공통 토큰 이름만 씁니다(`bg-primary`, `text-muted-foreground`, CSS에서는 `var(--primary)`). 색 코드를 직접 쓰지 않고, 토큰을 앱에서 덮어쓰지 않습니다.
3. `style.css`의 요소 규칙(`button`, `p`, `h1` 등)은 `.legacy` 안에서만 적용됩니다. 페이지 본문과 `Modal` 내용이 `.legacy`이고, 공통 셸과 공통 컴포넌트는 영향을 받지 않습니다.
4. `style.css`는 `components` 레이어라 같은 속성이면 Tailwind 유틸리티가 이깁니다. 기존 화면을 유틸리티와 공통 컴포넌트로 옮기면 해당 `style.css` 규칙을 지웁니다.
5. 회색 바탕(`--muted`) 위의 흐린 글자(`--muted-foreground`)는 라이트 모드에서 4.35:1이라 WCAG AA(4.5:1)에 못 미칩니다. 그런 바탕을 새로 만들면 `style.css` 끝의 대비 규칙에 추가합니다.
6. 오류 문구는 `<label>` 밖에 두어 입력란의 접근성 이름을 바꾸지 않습니다.
