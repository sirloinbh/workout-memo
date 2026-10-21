# #113 화면 시각 회귀·반응형·접근성 자동 검사

- 이슈: https://github.com/sirloinbh/workout-memo/issues/113
- 브랜치: `test/113-ui-regression-checks`

## 목적

UI 컴포넌트 교체(#99~#103)와 Preflight 도입(#100), 모바일 레이아웃(#104) 중 화면이 깨지는지 자동으로 확인한다. 이 기준선이 이후 화면 교체의 비교 기준이 된다.

## 변경 내용

### 고정 데이터로 화면 검사(`e2e/support/ui-fixtures.ts`)

- 화면 검사는 공유 테스트 DB를 쓰지 않는다. 다른 e2e 시나리오가 삭제 API가 없는 루틴·머신을 고유 이름으로 남기므로, DB 내용에 따라 스크린샷이 달라지기 때문이다.
- `page.route('**/api/**')`로 모든 API를 고정 데이터로 응답한다. 시계는 `2026-10-15 10:00 KST`로 고정한다(`page.clock.setFixedTime`). 쓰기 요청과 정의하지 않은 경로는 404로 응답해 실제 서버에 닿지 않는다.
- 일지 6개, 목표 2개, 머신 2개, 신체 기록 5개를 둔다. 루틴 일정(`routineSchedule`)·오늘 진행(`routineProgress`)·종목 분석(`analyze`)은 화면 테스트(#60)와 같이 실제 서버 함수로 계산해 응답 형식이 서버와 어긋나지 않게 했다.
- 대상: 8개 페이지(`/`, `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`)와 주요 모달 3개(새 운동 기록, 목표 추가, 머신 등록).

### 반응형(`e2e/ui-responsive.spec.ts`)

- 360·390·768·1280px에서 모든 페이지와 모달의 `scrollWidth - innerWidth <= 0`을 확인한다(#71 검사를 확대). 모달은 화면 안에 있는지도 확인한다.
- 고정·sticky 요소(현재 데스크톱 사이드바, 이후 하단 탭 #104)가 `main`의 링크·버튼·입력을 가리지 않는지 확인한다. 각 조작 요소 중심의 `elementFromPoint`가 고정 요소이면 실패한다. 맨 위에서는 모든 고정 요소를 보고, 맨 아래로 스크롤했을 때는 화면 아래쪽 고정 막대만 본다. 중간 스크롤에서 sticky 머리글 밑으로 지나가는 것은 정상 동작이라 검사하지 않는다.
- 기존 `e2e/layout.spec.ts`(#71, 실제 서버·320/390px·메뉴 링크)는 유지한다.

### 접근성(`e2e/ui-a11y.spec.ts`)

- `@axe-core/playwright`로 WCAG 2.1 A/AA 규칙(`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)을 390·1280px의 모든 페이지와 모달에 적용한다.
- 도입 시 위반은 **색 대비(color-contrast) 하나뿐**이었다. 라벨·역할·이름 등 다른 규칙은 모두 통과했다.
  - 대비 위반: 551개 요소, 약 40가지 전경/배경 조합. 대부분 1회성 장식 색의 흐린 녹회색 보조 글자다.
  - 색을 고치면 디자인 톤이 바뀐다. 이것은 #98(디자인 기준, 사용자 확인 필요)·#100(전역 CSS 정리)의 범위다. 기준선보다 먼저 색을 바꾸면 비교 기준도 사라진다.
  - 그래서 현재 조합만 `e2e/a11y-known-contrast.json`에 화면별로 기록해 허용한다(11개 화면, 121개 조합). 새 조합과 다른 규칙의 위반은 실패한다. 색을 고칠 때 목록에서 지운다.

### 시각 회귀(`e2e/ui-visual.spec.ts`)

- 8개 페이지(전체 페이지)와 모달 3개(뷰포트)를 4개 폭에서 `toHaveScreenshot`으로 비교한다. 총 44장이다. 기준선은 `e2e/__screenshots__/ui-visual.spec.ts/`이다.
- 글꼴 렌더링은 OS·브라우저 버전마다 다르다. 그래서 비교는 `E2E_VISUAL=1`인 고정 컨테이너 `mcr.microsoft.com/playwright:v1.63.0-noble`의 내장 Chromium에서만 한다. 로컬 Windows 실행에서는 이 파일을 건너뛰고 기존처럼 설치된 Chrome으로 나머지를 실행한다.
- 애니메이션과 캐럿을 끄고, `networkidle`·`document.fonts.ready`·로딩 문구가 사라질 때까지 기다린 뒤 찍는다.
- `playwright.config.ts` 변경
  - 기준선 경로에 플랫폼 접미사를 붙이지 않는다(`snapshotPathTemplate`).
  - CI에서는 기준선을 쓰지 않는다(`updateSnapshots: 'none'`). 기준선이 없거나 다르면 실패한다.
  - `E2E_VISUAL`이 있으면 `channel: 'chrome'` 대신 내장 Chromium을 쓴다.

### CI(`.github/workflows/ci.yml`의 `e2e`)

- 작업을 고정 Playwright 컨테이너(`--ipc=host`)에서 실행한다. 기존 ubuntu-latest의 Google Chrome은 러너 이미지 갱신 때마다 버전이 바뀌어 스크린샷이 흔들리기 때문이다. PostgreSQL 서비스는 컨테이너 네트워크의 `postgres:5432`로 연결한다.
- 실패 시 업로드하는 아티팩트
  - `playwright-report`: `playwright-report`·`test-results`, diff 이미지 포함
  - `visual-baselines`: 시각 검사만 `--update-snapshots=changed`로 다시 실행해 만든 제안 기준선
- 기준선 갱신 절차는 [workout-testing](../../skills/workout-testing/SKILL.md)에 적었다. CI 실패 → diff 확인 → `visual-baselines` 아티팩트를 `e2e/__screenshots__/`에 반영 → 바뀐 파일 확인 후 커밋.

### npm 패키지

- 사용자 도입 승인(2026-10-21): `@axe-core/playwright@4.13.0`(루트 devDependency, `--save-exact --ignore-scripts`)
- 선정: 2026-10-07(14일 전) 이전 게시 안정판 중 최신(4.13.0, 2026-08-11). 4.14.0은 2026-10-15 게시라 제외했다. peer는 `playwright-core >= 1.0.0`이다.
- 추가된 패키지: `@axe-core/playwright@4.13.0`, `axe-core@4.13.0`. install 스크립트(`hasInstallScript`)는 없다.
- 루트 devDependency라 `frontend`·`backend`의 subtree lockfile과 Docker 빌드에는 영향이 없다.

### 문서

- `skills/workout-testing/SKILL.md`(+ `npm run skills:sync`), `AGENTS.md`, `README.md`에 검사 범위와 기준선 갱신 절차를 적었다.

## 검증

- 로컬(Windows, 설치된 Chrome): 테스트 DB가 없어 `npm run test:e2e` 전체는 실행하지 못했다.
  - 대신 화면 검사(API 모의)만 프론트 개발 서버로 띄우는 임시 설정으로 실행했다. 이 설정은 커밋하지 않았다.
  - `ui-responsive` 8개 + `ui-a11y` 22개, 30 passed.
- 검사가 실제로 실패하는지 일부러 깨뜨려 확인했다(임시 변경, 되돌림).
  - 폭 3000px 요소: `/ 가로 넘침` 실패
  - 화면 아래 200px 고정 막대: `button "수정"`, `button "하체 삭제"`가 가려졌다고 실패
  - 라벨 없는 입력: axe `label` 규칙 실패
- `npx tsc -p e2e/tsconfig.json`: 통과
- `npm run check`(로컬, `TEST_DATABASE_URL` 없음)
  - format·lint·contract·typecheck 통과
  - 백엔드 241개 중 206 pass, 35 skip. DB 통합 테스트는 실행되지 않았다.
  - 프론트 121 pass
  - `test:skills` 4, `test:docs` 3 통과, build 통과
  - `test:agents` 162개 중 2개 실패: 이 PC의 PowerShell 실행 정책(Restricted)이 테스트용 임시 `.ps1`을 막았다. 이번 변경과 무관한 환경 문제다. `PSExecutionPolicyPreference=Bypass`(프로세스 한정)로 다시 실행해 162 pass를 확인했다.
- `quick_validate.py skills/workout-testing`: `Skill is valid!`
- DB 통합 테스트와 전체 `npm run test:e2e`, 시각 기준선은 CI에서 확인한다(아래 CI 결과).

## 제한·후속

- 색 대비 위반 121개 조합은 허용 목록으로 남겼다. #98 디자인 기준 확정 후 #100·화면 교체(#101~#103)에서 토큰 색을 고치며 목록을 줄인다.
- 시각 회귀는 고정 데이터 화면만 본다. 빈 상태·오류 상태·저장 중 상태는 아직 기준선이 없다.
- 실기기 브라우저(모바일 Safari·삼성 인터넷)는 검사하지 않는다.
