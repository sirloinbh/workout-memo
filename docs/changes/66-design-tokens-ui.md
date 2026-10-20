# #66 디자인 토큰·Tailwind·공통 UI 컴포넌트

- 이슈: [#66](https://github.com/sirloinbh/workout-memo/issues/66) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 3단계 화면 기반)
- 브랜치: `style/66-design-tokens-ui`. #64(PR #65) 위에 쌓았다. 병합 순서는 #59 → #61 → #63 → #65 → 이 PR이다.

## 목적

`style.css`(약 1,380줄)에는 색·모서리·그림자 값이 리터럴로 반복되었다. 버튼·모달·오류 표시는 페이지마다 클래스 조합으로 흩어져 있었다.

## 변경 — 2026-10-20

### 패키지

사용자가 공급망 위험을 인지했다고 명시 승인한 뒤 설치했다.

- 설치
  - dependencies: clsx 2.1.1, tailwind-merge 3.7.0, class-variance-authority 0.7.1
  - devDependencies: tailwindcss 4.3.3, @tailwindcss/vite 4.3.3
  - 정확한 버전으로 고정했고 `--ignore-scripts`를 썼다.
- install 스크립트가 있는 새 패키지는 없다.
- 네이티브 컴파일러는 Tailwind(@tailwindcss/oxide-_)와 Parcel(lightningcss-_) 공식 플랫폼별 optional 패키지로 들어온다.
- subtree용 `frontend/package-lock.json`은 `--before=2026-10-06`으로 다시 만들었다.

### 디자인 토큰과 Tailwind

- `frontend/src/theme.css`
  - `@theme static`으로 토큰을 정의했다: 역할별 색 24개, 모서리 4단계, 그림자 2개.
  - Tailwind theme·utilities 레이어만 가져온다. Preflight(전역 리셋)는 기존 화면을 바꾸므로 넣지 않았다.
- `style.css`의 같은 값 리터럴을 토큰 변수로 바꿨다(일회성 스크립트 사용).
  - 바꾼 곳: 색 34곳, `border-radius` 17곳, 그림자 2곳.
  - 한 번만 쓰이는 장식 색(그래프 단계색 등)은 남겼다.
- `vite.config.ts`에 `@tailwindcss/vite` 플러그인을 추가했다.
- 제약: `style.css`는 레이어 밖에 있어서, 같은 속성이 겹치면 기존 규칙이 유틸리티보다 우선한다. 이 내용은 `docs/design-system.md`에 기록했다.

### 공통 컴포넌트

shadcn/ui 방식을 따랐고, CLI 없이 소스를 직접 작성했다.

- `lib/cn.ts`: clsx + tailwind-merge
- `components/ui/button.tsx`: cva 기반 `Button`. 변형은 `primary`·`subtle`·`text`·`icon`·`full`이며 기존 클래스 이름을 그대로 출력한다.
- `components/ui/field.tsx`: `Input`, `FieldError`, `invalidProps`. #64의 `aria-invalid`·`aria-describedby` 연결을 공통화했다.
- `components/ui/dialog.tsx`: 기존 `Modal`을 옮겼다. 동작과 DOM은 같다.
- `app.tsx` 적용 범위
  - 모든 모달을 `Dialog`로 바꿨다.
  - 일지·머신·목표 저장 버튼을 `Button full`로 바꿨다.
  - #64의 오류 표시 헬퍼와 목표 폼 입력을 `FieldError`·`invalidProps`·`Input`으로 바꿨다.
- `docs/design-system.md`: 토큰 표, 컴포넌트, 사용 규칙

## 테스트

새 테스트 `frontend/src/components/ui/ui.test.tsx` (4개):

- `Button` 변형이 기존 클래스를 그대로 출력한다.
- `cn`이 충돌하는 유틸리티를 정리한다.
- `FieldError`·`invalidProps`가 입력란과 오류를 연결하고, 메시지가 없으면 연결과 요소가 모두 없다.
- `Dialog`: 라벨, 닫기 버튼 포커스, 스크롤 잠금·복원, 내부 클릭으로는 닫히지 않음, Escape와 배경 클릭으로 닫힘.

화면 동일성 검증(실제 Chrome, 커밋하지 않은 임시 스펙과 캔버스 픽셀 비교):

- 대상: 8개 페이지(`/`, `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`), 일지 입력 모달, 목표 오류 모달. 각각 데스크톱 1280px과 모바일 390px으로 총 20장이다.
- 조건: 브라우저 시계를 고정하고 애니메이션을 껐다.
- 기준 신뢰성: 변경 전에 두 번 찍어 20장 모두 0픽셀 차이임을 먼저 확인했다.
- 결과: 변경 전후 비교 20장 모두 **0픽셀 차이**.

실행 결과(Node 24.21.0, 전용 테스트 DB, 로컬 Chrome):

| 검사                       | 결과                           |
| -------------------------- | ------------------------------ |
| `npm run check`            | **EXIT=0**                     |
| 백엔드 node:test (DB 포함) | **275 pass / 0 fail / 0 skip** |
| 프론트 Vitest              | **12 files, 89 pass / 0 fail** |
| `npm run test:e2e`         | **2 passed**                   |
| `docker build ./frontend`  | 성공                           |

## 제한·후속

- 기존 결함: 모바일 390px에서 페이지 전체 폭이 424px로 찍힌다(가로 넘침). 변경 전부터 있던 문제이고, 이번에는 동일성 유지가 목표라 고치지 않았다. 후속 이슈로 남긴다.
- 페이지 본문의 나머지 버튼·입력은 아직 기존 마크업이다. 화면을 수정할 때 `components/ui`로 옮긴다.
- 빌드 경고 `"use client" ... was ignored`는 #62의 react-router·react-query 번들에서 나오며 동작에는 영향이 없다.
