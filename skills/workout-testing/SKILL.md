---
name: workout-testing
description: Write or update behavior-focused tests with workout-memo implementations and fixes, run them before commits and PR creation or updates, and record actual results. Use with workout-implementation; for documentation-only changes validate the changed artifacts instead of adding unrelated app tests.
---

# Workout Memo 테스트 작성과 실행

프로젝트의 AGENTS.md와 workout-implementation 절차를 함께 따른다. 이 스킬은 테스트 작성·실행 기준이며 이슈·브랜치·docs·PR 절차와 CI 통과 후 병합 정책을 유지한다.

## 구현·수정과 함께 작성

- 기능을 구현하거나 동작을 수정할 때 해당 요구사항을 검증하는 테스트 코드를 함께 추가·수정하고, 구현과 테스트를 같은 작업 커밋에 포함한다. 기존 테스트 실행만으로 새 기능의 검증을 대신하지 않는다.
- 버그 수정에는 해당 버그의 재발을 잡는 회귀 테스트를 추가한다. 가능하면 수정 전 실패·수정 후 성공을 확인하고, 재현하지 못하면 그 한계를 기록한다.
- 리팩터링은 기존 동작 보존을 검증한다. 관련 테스트가 충분하면 그대로 유지할 수 있지만, 부족한 시나리오는 보강한다.
- 내부 구현을 그대로 반복하는 테스트보다 사용자에게 보이는 결과와 도메인 규칙을 검증한다. 정상 경로와 변경에 관련된 입력 오류·경계·실패 경로를 선택한다.
- 업무 로직은 단위, API·DB 저장·트랜잭션은 통합, 화면 입력·저장 흐름은 컴포넌트 또는 브라우저 테스트를 선택한다. 모든 변경에 모든 종류를 추가하지 않는다.
- 현재 도구: 백엔드 단위·DB 통합은 node:test(`backend/test`), 화면 컴포넌트는 Vitest·jsdom·React Testing Library(`frontend/src/*.test.tsx`), 실제 브라우저 흐름은 Playwright(`e2e/`, `npm run test:e2e`)다. 화면 테스트는 내부 hook이 아니라 사용자에게 보이는 역할·라벨·텍스트로 검증한다. 날짜는 `frontend/src/test/api.ts`의 `fixClock`으로 고정하고 API는 `mockApi`로 대체한다.
- 현재 설치된 테스트 도구와 명령을 확인한다. 설치하지 않은 도구를 사용했다고 보고하지 않는다.
- 화면 흐름·주소·실제 DB 저장이 바뀌면 `e2e/`의 Playwright 시나리오를 추가하거나 갱신한다. 테스트 DB(`E2E_DATABASE_URL`)로 `npm run test:e2e`를 실행하고, 개인 DB는 쓰지 않는다.
- 화면 공통 검사(#113): `e2e/ui-*.spec.ts`는 `e2e/support/ui-fixtures.ts`의 고정 데이터·시계로 모든 페이지와 주요 모달을 검사한다. 페이지·모달·API 응답이 추가되면 이 고정 데이터와 목록을 함께 갱신한다.
  - 반응형: 360·390·768·1280px에서 가로 넘침이 없고, 고정·sticky 요소(사이드바, 하단 탭)가 조작 요소를 가리지 않는다.
  - 접근성: axe WCAG 2.1 A/AA. 기존 저대비 색 조합만 `e2e/a11y-known-contrast.json`에 화면별로 허용한다. 새 조합이나 다른 규칙 위반은 실패한다. 색을 고치면 해당 항목을 지우고, 새 저대비 색을 목록에 추가해 통과시키지 않는다.
  - 시각 회귀: `e2e/ui-visual.spec.ts`의 기준선은 `e2e/__screenshots__/`이다. 글꼴 렌더링을 맞추려고 CI `e2e` 작업의 고정 컨테이너(`mcr.microsoft.com/playwright:v1.63.0-noble`, `E2E_VISUAL=1`)에서만 비교하고, Windows 등 로컬 실행에서는 건너뛴다. CI는 기준선을 쓰지 않는다. 이미지는 `.github/workflows/ci.yml`에 digest로 고정한다. `@playwright/test`를 올리면 같은 버전 이미지의 digest로 바꾸고 기준선을 다시 만든다.
- 의도한 화면 변경으로 기준선을 갱신할 때:
  1. PR을 push하면 CI `e2e`가 화면 차이로 실패한다. `playwright-report` 아티팩트의 diff 이미지로 바뀐 화면이 의도한 것뿐인지 확인한다.
  2. 같은 실행의 `visual-baselines` 아티팩트를 받아 `e2e/__screenshots__/`에 덮어쓴다. 예: `ghp run download <run-id> --name visual-baselines --dir e2e/__screenshots__`(`scripts/gh-project.ps1`을 거칠 때 짧은 옵션 `-n`·`-D`는 인자 오류가 난다).
  3. `git diff --stat e2e/__screenshots__`로 바뀐 파일이 의도한 화면뿐인지 확인하고 구현과 같은 커밋에 넣는다. 갱신한 장수와 이유를 docs/changes와 PR에 적는다.
  4. 의도하지 않은 차이는 기준선을 갱신하지 말고 구현을 고친다.
- 모양을 바꾸지 않아야 하는 화면 변경(토큰화·컴포넌트 추출·CSS 도구 도입)은 실제 Chrome에서 전후 픽셀 비교로 확인한다. 기준을 두 번 찍어 차이가 0인지 먼저 확인한 뒤 비교하고, 비교한 장수와 차이 픽셀을 기록한다. 절차는 workout-foundation의 [검증된 반복 절차](../workout-foundation/references/procedures.md)를 따른다.
- 목업 API가 실제 서버라면 거부할 입력을 받아주고 있으면, 목업이 아니라 테스트 데이터를 실제 계약(`shared/contract.ts`)에 맞춘다.
- 테스트 데이터는 운영·사용자 데이터와 분리한다. 시간·날짜·무작위 값에 의존하는 검사는 실행 환경이 바뀌어도 같은 의미를 검증하도록 작성한다.

## 커밋 전

- 최종 커밋 대상의 변경과 테스트를 확인하고 관련 테스트를 실제로 실행한다. 구현·테스트·docs 기록을 같은 커밋에 포함한다.
- 테스트 코드 경로, 검증한 동작, 실행 명령과 결과를 docs/changes의 해당 이슈 기록에 남긴다.
- 실패한 테스트를 skip·삭제하거나 assertion을 약화해 통과시키지 않는다. 실패를 해결한 뒤 커밋한다.
- 필요한 실행 환경을 준비할 수 없다면 실행하지 않았음을 기록한다. 검증되지 않은 구현을 완료로 보고하지 않으며, 남은 검증이 있는 PR은 draft로 전달한다.

## PR 생성·갱신 전

- 최종 diff에 대해 관련 테스트와 프로젝트 필수 검사를 실행하고 성공을 확인한다. 커밋 후 변경이 없고 동일한 대상의 결과가 유효하면 불필요하게 같은 검사를 반복할 필요는 없다.
- PR에 추가·수정한 테스트, 실행 명령, pass/fail/skip, 미실행 이유를 기록한다. DB 환경변수 미설정으로 건너뛴 통합 테스트는 성공으로 계산하지 않는다.
- PR 이후 코드·테스트를 고치면 영향받는 검사를 다시 실행하고 docs·PR 결과를 갱신한다. CI 실패도 해결한다.
- 문서·스킬·포맷만 바뀌고 앱 동작 변경이 없으면 그 산출물의 검증기·포맷·링크 검사로 검증하고 앱 테스트를 추가하지 않은 이유를 적는다. 실행 코드·검사 스크립트의 동작 변경은 관련 테스트 또는 실행 검증을 포함한다.
- PR 자동 리뷰의 보완 커밋에도 관련 테스트를 함께 추가·수정하고 다시 실행한다. 최종 head의 필수 CI 검사가 모두 통과한 뒤에만 PR을 병합한다. 연속 PR은 main을 merge한 뒤 테스트를 다시 실행한다.
