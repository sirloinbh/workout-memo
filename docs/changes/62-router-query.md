# #62 React Router URL 이동과 TanStack Query 서버 조회

- 이슈: [#62](https://github.com/sirloinbh/workout-memo/issues/62) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 3단계 화면 기반)
- 브랜치: `feat/62-router-query`. #60(PR #61) 위에 쌓았다. 병합 순서는 #59 → #61 → 이 PR이다.

## 목적

- 화면 이동이 `page` 상태뿐이라 새로고침하면 대시보드로 돌아갔다. 주소 공유와 뒤로 가기도 되지 않았다.
- 서버 조회는 수동 `refresh`와 버전 카운터로 경쟁 응답을 막았다. 저장 후 갱신도 직접 호출했다.

## 변경 — 2026-10-21

### 패키지

사용자가 공급망 위험을 인지했다고 명시 승인한 뒤 설치했다.

- 설치: react-router 8.4.0, @tanstack/react-query 5.104.1. 정확한 버전으로 고정했고 `--ignore-scripts`를 썼다.
- 버전: 게시 후 14일 이상 지난 버전이다.
- 점검: 새로 추가된 패키지는 5개다(@remix-run/route-pattern, @tanstack/query-core, cookie-es 포함). install 스크립트가 있는 패키지는 없다.
- subtree용 `frontend/package-lock.json`은 임시 디렉터리에서 `--package-lock-only --ignore-scripts --before=2026-10-06`으로 다시 만들었다.

### React Router

- 페이지 URL: `/`(대시보드), `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`.
- 알 수 없는 경로는 `/`로 replace 이동한다.
- 기존 nginx의 `try_files ... /index.html`이 모든 경로를 앱으로 보내므로 서버 설정 변경은 없다.
- 메뉴와 로고는 `NavLink`로 바꿨다. `nav aria-label="주요 메뉴"`를 붙였고, 현재 페이지에는 `aria-current="page"`와 `.active`가 붙는다.
- CSS는 `nav button`을 `nav a`로 옮겨 기존 모양을 유지했다.
- 본문 안의 이동 버튼("전체 보기" 등)은 버튼으로 두고 `navigate`만 사용한다.
- `App`이 `QueryClientProvider`와 `BrowserRouter`를 감싼다. 화면 본문은 `Workspace`가 담당한다. QueryClient는 앱 마운트마다 새로 만들어 탭과 테스트를 서로 독립시킨다.

### TanStack Query

- 대시보드·일지·목표·머신에서 쓰는 다음 조회를 query로 바꿨다.
  - `['workouts', from, to]`
  - `['goals']`, `['machines']`, `['brands']`
  - `['official-machine-weights']`(실패해도 `null`로 처리해 일지 조회를 막지 않음)
- 기간이 query key에 포함되므로 늦게 도착한 이전 기간의 응답은 선택한 기간의 데이터·오류·로딩 상태를 바꾸지 못한다. 기존 규칙을 버전 카운터 없이 유지한 것이다.
- 저장·삭제·백업 복원 후에는 `invalidateQueries()`로 활성 query(현재 기간과 공유 목록)만 다시 불러온다. 이 동작은 기존 테스트의 "요청 1회 추가" 검사로 검증한다.
- `retry: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`를 설정했다. 실패는 기존처럼 "다시 연결" 버튼으로 다시 시도한다. 휴식 타이머가 focus 이벤트를 쓰므로 focus 때 자동으로 다시 조회하지 않게 했다.
- 동작 변경: 페이지를 오갈 때 같은 기간의 일지를 다시 조회하지 않는다(캐시 재사용). 기존 코드도 기간이 바뀔 때만 조회했으므로 결과는 같다.
- 루틴·분석·신체 기록·백업 페이지 내부의 조회는 이번 범위에서 유지했다.

## 테스트

- 기존 화면 테스트 77개: 메뉴 클릭을 `frontend/src/test/nav.ts`의 `openPage`로 바꿨다. 이 헬퍼는 링크를 누른 뒤 `aria-current="page"`까지 확인한다. 나머지 assertion은 바꾸지 않았다. setup은 매 테스트 뒤 주소를 `/`로 되돌린다.
- 새 `frontend/src/routing.test.tsx` (5개)
  - 직접 URL로 접근하면 해당 페이지가 열리고 메뉴에 현재 페이지로 표시된다.
  - 알 수 없는 주소는 대시보드로 이동한다.
  - 메뉴 링크가 URL을 바꾸고, 뒤로 가기가 이전 페이지를 복원한다.
  - 페이지를 오가도 일지를 다시 조회하지 않는다.
  - 조회 실패를 알리고, "다시 연결"로 다시 불러오면 경고가 사라진다.
- `e2e/workout-crud.spec.ts`에 실제 Chrome 시나리오를 추가했다: 나의 목표 → 새로고침 후 유지 → 루틴짜기 → 뒤로 가기로 나의 목표 복원.

실행 결과(Node 24.21.0, 전용 테스트 DB, 로컬 Chrome):

| 검사                       | 결과                               |
| -------------------------- | ---------------------------------- |
| `npm run check`            | **EXIT=0**                         |
| 백엔드 node:test (DB 포함) | **272 pass / 0 fail / 0 skip**     |
| 프론트 Vitest              | **10 files, 82 pass / 0 fail**     |
| 워커 / 스킬                | 212 pass / 4 pass                  |
| `npm run test:e2e`         | **2 passed** (일지 CRUD, URL 유지) |
| `docker build ./frontend`  | 성공                               |

## 제한·후속

- 로그인이 없는 개인용 앱이라 경로 보호나 권한 처리는 하지 않는다.
- 다음은 3단계 후속 이슈로 진행한다: React Hook Form과 공유 Zod, 디자인 토큰과 공통 컴포넌트.
