# #60 Vitest·RTL 화면 테스트 이전과 Playwright 일지 CRUD 검증

- 이슈: [#60](https://github.com/sirloinbh/workout-memo/issues/60) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 4단계 검증 확대)
- 브랜치: `test/60-vitest-playwright`. #58(PR #59) 위에 쌓았으므로 #59를 먼저 병합해야 한다.

## 목적

기존 화면 테스트 9개 파일은 `main.tsx`를 트랜스파일한 뒤 vm에서 자체 hook 어댑터(useState·useEffect·useRef·useCallback)로 실행했다. 이 방식에는 두 가지 한계가 있었다.

- 3단계에서 React Router·TanStack Query·React Hook Form을 도입하는 것처럼 내부 구현만 바꿔도 테스트가 깨진다.
- 실제 DOM, 이벤트, React 스케줄링, 브라우저 동작을 검증하지 못한다.

## 변경 — 2026-10-20

### 패키지

사용자가 공급망 위험을 인지했다는 명시 승인을 받은 뒤 설치했다. 버전은 정확히 고정했고 `--ignore-scripts`로 설치했다.

선정 기준:

- 공식 저장소와 게시자
- 게시 후 14일 이상 지난 버전 중 최신. 당시 최신판 다수가 1~9일 전에 게시되어 제외했다.
- peer 호환: React 19.3.0, Vite 6.4.4

| 위치          | 패키지                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frontend(dev) | vitest 5.0.3, jsdom 30.1.2, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.7, @testing-library/jest-dom 7.0.1 |
| root(dev)     | @playwright/test 1.63.0. 브라우저는 내려받지 않고 설치된 Chrome(`channel: 'chrome'`)을 사용한다                                                             |

설치 후 점검:

- lockfile에 새로 추가된 패키지 76개 중 install 스크립트가 있는 패키지는 없다. 기존 esbuild·fsevents만 해당한다.
- IOC 도메인(webhook.site, ngrok 등)과 의심 워크플로를 검색했고 발견하지 못했다.
- `npm audit`: 0 vulnerabilities.
- 직접 의존성은 고정 버전이고, 하위 의존성은 lockfile에 고정되어 있다.

### 화면 테스트 이전

- `App`을 `frontend/src/main.tsx`에서 `frontend/src/app.tsx`로 옮겨 export했다. `main.tsx`는 렌더링만 한다. 앱 동작 코드는 바꾸지 않았다.
- 테스트 기반:
  - `frontend/vitest.config.ts`: jsdom, `TZ=UTC` 기기 시계
  - `frontend/src/test/setup.ts`: 정리, 타이머·전역·mock 복원, localStorage 초기화
  - `frontend/src/test/api.ts`: `fixClock`은 Date만 2026-10-14T15:30Z(서울 10-15 00:30)로 고정한다. `mockApi`는 fetch를 대체하고 요청을 기록한다. `json`, `deferred` 보조 함수도 포함한다.
- 이전한 시나리오 수는 원본과 같다.

| 기존 (`backend/test`, 삭제)                             | 새 파일 (`frontend/src`)                             | 시나리오      |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| period-ui.test.ts                                       | period.test.tsx                                      | 21            |
| workout-draft-ui.test.ts                                | workout-draft.test.tsx                               | 18            |
| set-completion-ui.test.ts                               | set-completion.test.tsx                              | 8             |
| routines-ui.test.ts                                     | routines.test.tsx                                    | 6             |
| routine-progress-ui.test.ts                             | routine-progress.test.tsx                            | 7             |
| analysis-ui / backup-ui / body-ui / official-weights-ui | analysis / backup / body / official-weights.test.tsx | 3 / 4 / 4 / 6 |

- assertion을 약화하지 않았다. 원래와 정확히 같지 않고 가장 가까운 동등 표현으로 옮긴 부분:
  - **입력**: jsdom의 date·number 입력은 키 입력을 받지 못하거나 소수점 중간값을 버린다. 그래서 `fireEvent.change`로 값을 설정했다.
  - **같은 렌더에서 두 번 누르기**(중복 제출, 휴식 확정, 세트 완료 연타): 기존 테스트의 같은 렌더 핸들러 두 번 호출을 하나의 `act()` 안에서 두 번 클릭하는 것으로 재현했다.
  - **요청 시한**: React와 testing-library도 setTimeout을 쓰므로 15초 타이머만 추적해, 정확히 하나가 남아 있는지 검사했다.
  - **필수 입력 검증을 건너뛰는 제출**: 기존 테스트가 `onSubmit`을 직접 호출하던 의미를 유지하려고 일부 테스트는 `fireEvent.submit`을 사용한다.
  - **백업 대용량 파일**: 기존 `/10MB/` 검사는 정적 안내 문구에도 일치해 항상 통과했다. 그래서 경고 자체에 10MB가 들어 있는지 확인하는 검사를 추가했다.
- 분석·루틴 진행 테스트는 기존처럼 실제 백엔드 `analyze`·`routineSchema`·`routineProgress`로 목업 응답을 계산한다(`backend/src` import).
- 순수 함수 테스트(`rest-timer`, `routine-progression`, `service-date`)는 화면 구조와 무관하므로 `backend/test`에 그대로 두었다.

### 브라우저 검증 (Playwright)

- `playwright.config.ts`
  - API(`tsx backend/src/server.ts`, 3101)와 화면(Vite, 5174)을 띄운다. 로컬 개발 서버(3001·5173)와 겹치지 않는 포트다.
  - DB는 `E2E_DATABASE_URL`(없으면 `TEST_DATABASE_URL`)이다. 둘 다 없으면 개인 DB를 쓰지 않도록 시작 전에 실패한다.
  - Chrome을 Asia/Seoul·ko-KR로 실행한다.
- `frontend/vite.config.ts`의 프록시 대상을 `API_PROXY_TARGET`으로 바꿀 수 있게 했다. 기본값은 기존 3001이다.
- `e2e/workout-crud.spec.ts` 시나리오:
  - 고정된 과거 날짜에 새로 만든 고유 제목으로 일지를 생성한다(총중량 100.25kg × 5).
  - 목록과 누적 볼륨 501.25kg을 확인하고, 새로고침 후에도 남아 있는지 확인한다.
  - 수정 후 600kg이 되고 새로고침 후에도 유지되는지 확인한다.
  - 삭제 후 목록이 0개, 볼륨이 0kg이고 새로고침 후에도 그대로인지 확인한다.
  - 실패로 남은 데이터는 afterAll에서 API로 정리한다.
- `e2e/tsconfig.json`을 추가하고 루트 `typecheck`에 포함했다. `test-results/`, `playwright-report/`는 ignore한다.

### 명령·CI·문서

- 루트 `npm test`는 백엔드 node:test와 프론트 Vitest를 모두 실행한다. 프론트만 실행하려면 `npm run test -w frontend`를 쓴다.
- `npm run test:e2e`를 추가했다.
- CI에 `e2e` 작업을 추가했다: PostgreSQL 서비스, `db:migrate`, `test:e2e`, 실패 시 리포트 업로드.
- AGENTS.md(검증 명령), README, `skills/workout-testing/SKILL.md`(현재 도구와 작성 기준), `stack.md`를 갱신했다. `npm run skills:sync`도 실행했다.

## 테스트

실행 환경: Node 24.21.0, npm 11.19.0, 전용 테스트 DB(127.0.0.1:55434), 로컬 Chrome

| 검사                       | 결과                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `npm run check`            | **EXIT=0** (format·lint·typecheck(e2e 포함)·build 통과)             |
| 백엔드 node:test (DB 포함) | **272 pass / 0 fail / 0 skip**. 이전된 UI 77개가 빠졌다(이전 349개) |
| 프론트 Vitest              | **9 files, 77 pass / 0 fail**. 별도로 두 번 더 반복해 모두 77 pass  |
| 워커·스킬 테스트           | check 안에서 통과                                                   |
| `npm run test:e2e`         | **1 passed** (로컬 Chrome, 테스트 DB)                               |

## 제한·후속

- CI e2e는 ubuntu-latest에 미리 설치된 Google Chrome을 사용한다. 러너 이미지에서 Chrome이 빠지면 별도 설치 단계가 필요하다.
- 화면 레이아웃·포커스 이동은 이번 e2e 범위가 아니다. 일지 CRUD 흐름만 검증한다.
- 3단계(React Router·TanStack Query·React Hook Form·디자인 토큰)는 이 테스트를 안전망으로 별도 PR에서 진행한다.

## CI docker-build 수정 — 2026-10-20

- PR 이후 CI의 `docker-build`가 실패했다. 원인은 두 가지였다.
  - subtree 배포용 `frontend/package-lock.json`에 새 devDependencies가 없어 Docker의 `npm ci`가 실패했다.
  - Docker 컨텍스트에는 `backend/`와 `@types/node`가 없다. 그런데 빌드 `tsc`가 이를 import하는 테스트 파일과 `vite.config.ts`까지 검사했다.
- `frontend/package-lock.json`을 임시 디렉터리에서 다시 만들었다(`npm install --package-lock-only --ignore-scripts --before=2026-10-06`). 하위 의존성도 2026-10-06 이전 게시본만 사용했고, 새 install 스크립트는 없다.
- `frontend/tsconfig.build.json`을 추가했다. 빌드는 앱 소스만 타입 검사하고 테스트·`vite.config.ts`는 제외한다. 전체 타입 검사는 모노레포 `npm run typecheck`가 계속 담당한다.
- 검증: 로컬 `docker build ./frontend`, `docker build ./backend` 모두 성공.
