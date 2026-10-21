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

## CI 결과와 기준선 커밋 — 2026-10-21

- 첫 push 실행(run 39601581578)
  - `verify`(DB 통합 포함 `npm run check`)·`docker-build`·`terraform`: 성공
  - `e2e`: 44 failed, 36 passed. 실패 44건은 모두 기준선이 없는 `ui-visual`이다. 기능 e2e·반응형·접근성은 고정 컨테이너에서도 통과했다.
- 같은 실행의 `visual-baselines` 아티팩트(44장)를 `e2e/__screenshots__/ui-visual.spec.ts/`에 커밋했다.
  - 대시보드 390px, 루틴 1280px, 새 운동 기록 모달 390px를 직접 열어 확인했다.
  - 고정 데이터(이번 주 2회·누적 6,660 kg·목표 1/2, 루틴 목록), 한글 글꼴, 모달 배치가 정상이었다.
- `gh-project.ps1`을 거칠 때 `run download`의 짧은 옵션(`-n`·`-D`)이 인자 오류를 내서, 스킬의 예시를 `--name`·`--dir`로 고쳤다.
- 기준선 커밋 재실행(run 39602894808, `0aadfea`): `verify`·`e2e`·`docker-build`·`terraform` 모두 성공. 시각 비교 44장이 재시도 없이 통과해 실행 간에 안정적이다.

## PR 자동 리뷰 1차 — 2026-10-21

`origin/main`(#129 병합)을 브랜치에 merge한 뒤(충돌 없음) 별도 읽기 전용 리뷰 에이전트로 PR 전체 diff를 검토했다. 치명·주요 결함은 없었고 minor 5건이 나왔다.

| #   | 지적                                                                                                                                                                                                                                       | 처리                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/routine-progress` 모의가 사용자 증량 단위(벤치프레스 2.5 kg)를 적용하지 않고 기본 5 kg으로 계산했다. 실제 서버는 `withWeightSteps(plan, steps)`로 계산하므로, 모의 응답에 서버가 낼 수 없는 목표 중량이 들어 있었다(예: 105 → 102.5 kg). | 반영. `weightSteps` 상수 하나로 `/exercise-weight-steps` 응답과 `routineProgress(withWeightSteps(...))` 계산을 맞췄다. 바뀐 값은 앞으로의 루틴 일정(`days`)에만 있고 고정 날짜(목요일, `today_plan` 없음)의 화면에는 나타나지 않아, 기준선 44장은 그대로 통과했다(아래 CI 결과). |
| 2   | `/goal-suggestion` 모의가 운동과 무관하게 `weight_step: 5, base: null`을 돌려줬다.                                                                                                                                                         | 반영. 서버 규칙(최근 목표 → 없으면 최근 운동의 가장 무거운 완료 세트, 운동별 증량 단위)을 같은 고정 데이터로 계산한다. 현재 기준선은 빈 운동명 상태라 화면 변화는 없다.                                                                                                          |
| 3   | 허용 목록에서 더는 나타나지 않는 색 조합(오래된 항목)을 검출하지 않는다.                                                                                                                                                                   | 분리: [#131](https://github.com/sirloinbh/workout-memo/issues/131). 테스트 로직 변경과 별도 검증이 필요하고 색 수정(#98·#100)과 함께 다루는 편이 맞다.                                                                                                                           |
| 4   | 시각 비교 컨테이너 이미지가 태그로만 고정돼 태그 재게시 시 글꼴이 바뀔 수 있다.                                                                                                                                                            | 반영. 기준선을 만든 실행이 받은 digest(`sha256:eff16c30…a4a27`, run 39602894808 로그와 MCR 레지스트리에서 같은 값 확인)로 고정했다.                                                                                                                                              |
| 5   | 기준선 커밋 뒤 CI 결과가 docs에 없다.                                                                                                                                                                                                      | 반영(위 재실행 기록).                                                                                                                                                                                                                                                            |

### 1차 보완 검증

- `npx tsc -p e2e/tsconfig.json`: 통과
- 모의 응답 비교(임시 스크립트, 커밋 안 함): 수정 전후 `/routine-progress`에서 벤치프레스 목표 중량만 바뀌었다(예: 105 → 102.5, 120 → 110 kg). 다른 값은 같다.
- `npm run check`(로컬 Windows, DB 없음, `PSExecutionPolicyPreference=Bypass`)
  - format·lint·contract·typecheck 통과
  - 첫 실행에서 백엔드 `body measurement range query ...` 1건이 `fetch failed: bad port`로 실패했다. `listen(0)`이 고른 임의 포트가 Node fetch 차단 포트에 걸린 경우로, 이번 변경(e2e·CI·docs)과 무관하다. 다시 실행해 통과했다.
  - 재실행: 백엔드 241개 중 206 pass, 35 skip(DB 통합 미실행), 프론트 121 pass, `test:agents` 167, `test:skills` 4, `test:docs` 3 pass, build 통과
- 로컬에는 테스트 DB와 Docker가 없어 `npm run test:e2e`는 실행하지 못했다. e2e 전체는 CI 고정 컨테이너에서 확인했다.

### 1차 보완 CI — `dd2beab`

- run 39607992359(CI): `verify`·`e2e`·`docker-build`·`terraform` 모두 성공. `ui-visual` 44장은 기존 기준선과 일치했다. 그래서 기준선을 갱신하지 않았다.
- 같은 head의 Local agent workflow·Project GitHub authentication 검사도 성공했다.

## PR 자동 리뷰 2차 — 2026-10-21

별도 읽기 전용 리뷰 에이전트로 1차 반영(`dd2beab`)과 최종 전체 diff를 검토했다. 1·2·4·5 반영이 서버 규칙(`backend/src/routes/routines.ts`, `weight-steps.ts`)과 맞고, 새 결함은 없다고 확인했다.

- 지적(문서): 1차 표에 "기준선을 갱신했다"는, 실제와 다른 문구가 있었다. → 실제 결과(44장 그대로 통과)로 고쳤다.
- 지적(낮음): 스킬이 컨테이너 이미지의 digest 고정과 Playwright 갱신 시 digest·기준선 재생성을 안내하지 않았다. → `skills/workout-testing/SKILL.md`에 한 문장 추가, `npm run skills:sync`.
- 3차 리뷰는 하지 않는다(정책상 최대 2회).
- 2차 보완 검증: `prettier --check .` 통과, `npm run test:skills` 4 pass, `npm run test:docs` 3 pass, `quick_validate.py skills/workout-testing`(`PYTHONUTF8=1`) `Skill is valid!`. 문서·스킬만 바뀌어 앱 테스트는 다시 실행하지 않았다(직전 `npm run check` 결과 유효).
