# 디자인 시스템

화면의 색·모양 토큰과 공통 UI 컴포넌트 사용 규칙입니다(#66).

## 구성

| 파일                                    | 역할                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `frontend/src/theme.css`                | 디자인 토큰(`@theme static`)과 Tailwind theme·utilities 레이어. Preflight는 넣지 않음 |
| `frontend/src/style.css`                | 기존 화면 스타일. 색·모서리·그림자는 토큰 변수(`var(--color-*)` 등)를 참조            |
| `frontend/src/lib/cn.ts`                | `cn()` = clsx + tailwind-merge. 클래스 조건 결합과 Tailwind 충돌 정리                 |
| `frontend/src/components/ui/button.tsx` | `Button`(class-variance-authority): `primary`·`subtle`·`text`·`icon`, `full`          |
| `frontend/src/components/ui/field.tsx`  | `Input`, `FieldError`, `invalidProps(name, message)`: 오류 문구와 입력란 연결         |
| `frontend/src/components/ui/dialog.tsx` | `Dialog`: 제목 라벨, 닫기 버튼 포커스, Escape·배경 클릭 닫기, 스크롤 잠금             |

shadcn/ui 방식(컴포넌트 소스를 저장소에 두고 직접 소유)을 따릅니다. 공급망 규칙 때문에 shadcn CLI(`npx shadcn`)는 사용하지 않고 소스를 직접 작성합니다.

## 토큰

| 그룹        | 토큰                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 브랜드·동작 | `primary`, `on-primary`, `accent`, `focus`                                                                         |
| 글자        | `ink`, `ink-muted`, `ink-subtle`, `link`, `icon`                                                                   |
| 면·선       | `surface-sidebar`, `surface-modal`, `line`, `line-soft`, `line-input`, `backdrop`                                  |
| 메뉴        | `nav-active`, `nav-active-ink`                                                                                     |
| 보조 버튼   | `subtle`, `subtle-line`, `subtle-ink`                                                                              |
| 오류        | `danger`, `danger-surface`, `danger-line`, `danger-ink`                                                            |
| 모양        | `--radius-sm`(5px), `--radius-md`(6px), `--radius-lg`(9px), `--radius-xl`(12px), `--shadow-card`, `--shadow-modal` |

- 색은 CSS에서 `var(--color-<이름>)`으로 쓰고, Tailwind 유틸리티로는 `bg-primary`, `text-danger`, `border-line`, `rounded-lg`처럼 씁니다.
- 기존 값을 그대로 토큰으로 옮겼습니다. 도입 전후 주요 페이지 8개와 모달 화면 20장(데스크톱·모바일)이 실제 Chrome에서 픽셀 단위로 같았습니다.
- 한 번만 쓰이는 장식 색(그래프 단계색 등)은 아직 리터럴로 남아 있습니다. 같은 역할로 두 번 이상 쓰이면 토큰으로 올립니다.

## 규칙

1. 새 화면 요소는 `components/ui`의 컴포넌트를 먼저 사용합니다. 버튼은 `Button`, 모달은 `Dialog`, 폼 오류는 `invalidProps`와 `FieldError`입니다.
2. 새 색·모서리 값은 리터럴 대신 토큰을 씁니다. 새 토큰은 `theme.css`에 역할 이름으로 추가합니다.
3. `style.css`는 레이어 밖에 있어서, 같은 속성이 겹치면 기존 규칙이 Tailwind 유틸리티보다 우선합니다. 기존 클래스(`.primary`, `.modal input` 등)가 적용된 요소의 모양을 유틸리티로 바꾸려면, 먼저 해당 기존 규칙을 정리해야 합니다.
4. Preflight(전역 리셋)를 추가하면 기존 화면 전체가 바뀝니다. 도입하려면 별도 이슈에서 전체 화면 비교와 함께 진행합니다.
5. 오류 문구는 `<label>` 밖에 두어 입력란의 접근성 이름을 바꾸지 않습니다.
