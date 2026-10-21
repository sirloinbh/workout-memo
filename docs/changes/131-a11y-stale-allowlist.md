# #131 접근성 허용 목록의 오래된 색 조합 검출

- 이슈: [#131](https://github.com/sirloinbh/workout-memo/issues/131)
- 브랜치: `test/131-a11y-stale-allowlist`

## 목적

#113(PR #130)의 axe 검사는 기존 저대비 색 조합을 `e2e/a11y-known-contrast.json`에 화면별로 허용했다. 하지만 더는 나타나지 않는 항목을 검출하지 않았다. 색을 고친 뒤 항목을 지우지 않으면 옛 저대비 색으로 되돌아가도 조용히 통과했다. PR #130 1차 자동 리뷰 지적 3을 분리한 작업이다.

## 변경 — 2026-10-22

- `e2e/ui-a11y.spec.ts`
  - 화면 × 폭마다 따로 있던 테스트를 화면마다 하나로 합쳤다. 한 테스트가 390·1280px를 차례로 검사하고, 실제로 일치한 허용 조합을 모은다.
  - 목록에 있지만 두 폭 어디에도 나타나지 않은 조합이 있으면 실패한다. 메시지에 화면 이름과 조합을 표시한다.
  - 판정에 필요한 정보가 한 테스트 안에 있으므로 `--grep`으로 일부만 실행해도 거짓 실패가 없다. 여러 테스트에 걸친 집계나 실행 순서에 의존하지 않는다.
  - 폭마다 새 브라우저 컨텍스트를 연다. 같은 컨텍스트를 쓰면 운동 기록 모달이 `localStorage`에 남긴 초안 때문에 다음 페이지의 "운동 기록하기" 버튼이 비활성화되어 실패했다.
  - 폭별 위반은 `expect.soft`로 기록해 한 폭이 실패해도 다른 폭 결과와 오래된 조합 판정을 함께 보여 준다.
  - 새 테스트 `허용 목록은 검사하는 화면만 가리킨다`: 목록의 화면 이름이 검사 대상 페이지·모달에 없으면 실패한다. 화면을 지우거나 이름을 바꾼 뒤 남은 항목을 잡는다.
- `skills/workout-testing/SKILL.md`(+ `npm run skills:sync`): 목록은 줄어들기만 한다는 검사 동작을 적었다.
- 허용 목록(`a11y-known-contrast.json`)은 바꾸지 않았다. 현재 121개 조합은 모두 실제로 나타난다.

## 검증

로컬 Windows 11, 설치된 Chrome. 테스트 DB와 Docker가 없어 #130과 같이 화면 서버만 띄우는 임시 Playwright 설정(커밋하지 않음)으로 실행했다. 접근성 검사는 모든 API를 `page.route` 고정 데이터로 응답하므로 API 서버가 필요 없다.

- `npx playwright test e2e/ui-a11y.spec.ts`(임시 설정): 12 passed(화면 8, 모달 3, 목록 화면 이름 1)
- 일부러 깨뜨린 확인(임시 변경 후 되돌림)
  - `backup`에 쓰이지 않는 `#123456 on #ffffff` 추가 → `backup: 허용 목록에 있지만 390·1280px 어디에도 나타나지 않은 조합 ...`과 `#123456 on #ffffff`로 실패
  - 없는 화면 `old-screen` 추가 → 목록 화면 이름 테스트가 `old-screen`으로 실패
  - `--grep "journal 화면"`만 실행 → 1 passed(거짓 실패 없음)
  - `backup`에서 사용 중인 조합 하나 삭제 → 기존처럼 `color-contrast` 위반으로 실패
- `tsc -p e2e/tsconfig.json`, `eslint e2e/ui-a11y.spec.ts`, `prettier --check e2e skills .claude/skills`: 통과
- `npm run test:skills` 4 pass, `quick_validate.py skills/workout-testing`(`PYTHONUTF8=1`): valid
- `npm run check`(DB 없음, 프로세스 한정 `PSExecutionPolicyPreference=Bypass`): 통과
  - 백엔드 206 pass / 35 skip(DB 통합 미실행), 프론트 121 pass, `test:agents` 167, `test:skills` 4, `test:docs` 3, build 성공
- 시각 회귀·DB를 쓰는 e2e는 로컬에서 실행하지 않았다. PR CI의 `e2e` 작업이 전체를 실행한다.

## 자동 리뷰 1차 — 2026-10-22

별도 읽기 전용 리뷰 에이전트가 PR #135 전체 diff를 검토했다. 결과는 **보완점 없음**이다. 리뷰 횟수 정책에 따라 2차 리뷰 없이 CI 통과 후 병합한다.

- `browser.newContext`로 바꿔도 잃는 설정이 없다. `channel`은 브라우저 단위이고 `baseURL`·`locale`·`timezoneId`는 직접 넘긴다. 설치된 Playwright가 직접 만든 컨텍스트에도 trace(`retain-on-failure`)와 기본 시간 제한을 적용한다.
- 최근 main CI(run 39692517095) 컨테이너에서 기존 a11y 테스트는 폭당 약 2초였다. 합친 테스트도 기본 30초 제한까지 여유가 있다.
- 두 폭의 합집합으로 판정하므로 한 폭에서만 나타나는 조합 때문에 거짓 실패가 나지 않는다. `ui-visual`·`ui-responsive`에는 영향이 없다.
- nit(반영하지 않음): 컨텍스트 옵션을 세 개만 골라 넘기므로, 나중에 config `use`에 `colorScheme` 같은 컨텍스트 옵션을 추가하면 이 테스트에는 적용되지 않는다. 지금 동작은 맞으므로 기록만 남긴다. 그런 옵션을 추가할 때 함께 넘긴다.
