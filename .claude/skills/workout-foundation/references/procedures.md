# 검증된 반복 절차

로드맵 #3의 2~4단계(#58·#60·#62·#64·#66·#68)에서 실제로 실행하고 결과를 확인한 절차다. 이 저장소에서 같은 종류의 작업을 할 때 그대로 반복한다. 근거와 실행 결과는 각 `docs/changes/<번호>-*.md`에 있다.

## 1. npm 패키지 도입

전역 규칙상 npm 설치·삭제는 사용자의 명시적 위험 인지 확인이 있어야 한다. 확인을 받은 뒤 다음 순서로 진행한다.

1. **후보 확인**: 읽기 전용 `npm view`로 게시자·저장소·버전별 게시일·peer 의존성·engines·install 스크립트를 확인한다.
   - 게시 후 14일 이상 지난 버전 중 최신을 고른다. 공급망 공격은 새 게시본에서 일어난다.
   - 설치된 React·Vite·Zod·Node와 peer 범위가 맞는지 확인한다. 예: react-router 8은 react ≥ 19.2.7, vitest 5는 vite ≥ 6.4.
2. **사용자 확인**: 정확한 패키지·버전 목록과 위험 안내로 한 번에 확인받는다.
3. **설치**: `npm install --ignore-scripts --save-exact [-w <workspace>] <pkg>@<version>`.
4. **설치 후 점검**
   - lockfile에서 `hasInstallScript`가 있는 패키지가 기존 esbuild·fsevents 외에 없는지 확인한다.
   - 새로 추가된 패키지 목록을 기록한다.
   - IOC 문자열(webhook.site, ngrok.io 등)과 의심 워크플로를 검색한다.
5. **subtree용 lockfile 재생성**: `frontend/`·`backend/`는 자체 `package-lock.json`으로 Docker 안에서 `npm ci`를 한다. 이 lockfile은 임시 디렉터리에 해당 `package.json`과 기존 lockfile을 복사한 뒤 `npm install --package-lock-only --ignore-scripts --before=<14일 전 날짜>`로 다시 만들어 되돌려 놓는다. 하위 의존성도 같은 날짜 기준을 따른다.
6. **Docker 빌드 확인**: `docker build ./frontend`, `docker build ./backend`. 모노레포에서는 hoisting 덕분에 통과해도 단독 빌드에서는 실패할 수 있다(#60에서 실제로 발생).
7. **기록**: 버전·선정 기준·점검 결과를 docs/changes와 PR에 적는다.

## 2. 영역별 독립 빌드 유지

- `frontend`·`backend`·`database`·`infrastructure`는 각자의 Docker 컨텍스트와 subtree 저장소에서 따로 빌드된다. 영역 밖 경로를 import하는 앱 코드를 만들지 않는다.
- 두 영역이 같은 코드를 써야 하면 원본 하나와 복제본을 두고 검사한다. 사례:
  - `shared/contract.ts` → `contract:sync`·`contract:check`
  - `skills/` → `.claude/skills/`
- 테스트는 다른 영역 소스를 import할 수 있다. 대신 frontend 빌드는 `tsconfig.build.json`으로 테스트와 `vite.config.ts`를 제외하고, 전체 타입 검사는 모노레포 `npm run typecheck`가 맡는다.

## 3. 화면 리팩터링

1. **행동 테스트 먼저**: 사용자에게 보이는 역할·라벨·텍스트로 검증하는 RTL 테스트가 먼저 있어야 한다. 내부 hook·상태를 흉내 내는 테스트는 리팩터링에 깨진다. 그래서 #60에서 vm 하네스 테스트를 RTL로 옮긴 뒤 #62·#64·#66을 진행했다.
2. **동작 보존 확인**: 리팩터링으로 바뀌는 것은 테스트의 탐색 방법뿐이어야 한다. 예: 메뉴 버튼 → 링크(`openPage`). assertion이 바뀌면 이유를 docs에 적는다. 목업만 받아주던 잘못된 입력처럼 실제 서버와 다른 테스트 데이터는 실제 계약에 맞춰 고친다.
3. **모양 보존 확인**: 모양을 바꾸지 않는 변경(토큰화, 컴포넌트 추출, CSS 도구 도입)은 실제 Chrome에서 픽셀 비교한다.
   - 브라우저 시계를 고정하고 애니메이션을 끈다. 데스크톱·모바일에서 주요 페이지와 모달의 전체 화면을 변경 전후로 찍는다.
   - 기준을 먼저 두 번 찍어 차이가 0인지 확인한 다음, 변경 후와 비교한다.
   - 스크린샷 스펙과 비교 스크립트는 임시로만 쓰고 커밋하지 않는다. 결과(장수·차이 픽셀)를 기록한다.
4. 검증 중 발견한 기존 결함은 범위를 넓혀 고치지 않고 별도 이슈로 등록한다. 예: #71 모바일 가로 넘침.

## 4. 연속(stacked) PR

- 앞 PR이 병합되기 전에 다음 단계를 진행해야 하면, 앞 브랜치에서 새 브랜치를 만든다. PR 대상은 항상 `main`으로 둔다.
- PR 본문 첫 줄에 병합 순서를 적는다. 앞 PR이 병합되기 전까지는 diff에 앞 커밋이 함께 보인다는 점도 적는다.
- 아래 브랜치를 고쳐야 하면 그 브랜치에 커밋하고, 위 브랜치마다 순서대로 `git merge`해서 push한다. force push로 PR 이력을 다시 쓰지 않는다.
- 각 PR의 docs/changes 기록은 그 PR 브랜치에서 고친다. 위 PR에서 아래 PR 문서를 대신 고치지 않는다.
- 병합은 아래 PR부터 순서대로 한다. 앞 PR이 병합되면 다음 브랜치에 `origin/main`을 merge해 충돌을 해결하고, 테스트를 다시 실행해 push한다. CI가 통과하면 병합하고 스택 끝까지 반복한다.

## 5. 문서·계약 산출물

다음 산출물은 코드와 어긋나면 `npm run check`가 실패한다. 생성기를 실행한 결과를 함께 커밋한다.

| 산출물                                                | 갱신 명령                                  | 검사                               |
| ----------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| `docs/api.md` 엔드포인트 표                           | 직접 수정                                  | `api-contract.test.ts`             |
| `docs/openapi.json`                                   | `npm run openapi`                          | `openapi.test.ts`                  |
| `backend/src/contract.ts`, `frontend/src/contract.ts` | `npm run contract:sync`                    | `contract:check`                   |
| `.claude/skills/`                                     | `npm run skills:sync`                      | `test:skills`                      |
| DB 스키마                                             | `database/migrations/`에 새 번호 파일 추가 | `migrations.test.ts`, `db:migrate` |
