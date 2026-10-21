# 개발 기준

이슈 #4에서 도입하는 기준이다. 개발 명령은 우산 모노레포 루트에서 실행한다.

## 실행 환경

- Node.js 24.21.0, npm 11.19.0. .nvmrc와 .node-version은 Node 선택용이다.
- package.json의 engines와 .npmrc의 engine-strict가 호환되지 않는 설치를 차단한다. packageManager는 npm 버전을 명시한다.
- 설치는 npm ci를 사용한다. 의존성 추가·변경은 npm install을 사용하고 package.json과 package-lock.json을 함께 커밋한다.
- npm workspaces가 루트 잠금 파일을 관리한다. frontend와 backend의 개별 잠금 파일은 독립 저장소·Docker 빌드용이다. 해당 package.json 변경 시 같은 고정 Node/npm 환경에서 각각 npm install --package-lock-only --workspaces=false로 갱신한다.
- Windows는 사용 중인 버전 관리자로 위 Node 버전을 선택한다. 시스템 전체 Node를 이 프로젝트가 자동 변경하지 않는다.
- CI·Docker 빌드도 동일한 Node/npm 기준을 사용한다. .local은 로컬 임시 도구용이며 커밋하지 않는다.

## 명령

| 명령                 | 역할                                                    |
| -------------------- | ------------------------------------------------------- |
| npm ci               | 잠금 파일대로 설치                                      |
| npm run dev          | 프론트엔드·API 개발 서버                                |
| npm run format       | 지원 파일의 포맷 수정                                   |
| npm run format:check | 포맷 차이 검사                                          |
| npm run lint         | ESLint 검사, 경고도 실패 처리                           |
| npm run typecheck    | 프론트·백엔드·백엔드 테스트 타입 검사                   |
| npm test             | 기존 단위·DB 통합 테스트                                |
| npm run test:agents  | 로컬 에이전트 워커 동작 테스트                          |
| npm run build        | 프로덕션 빌드                                           |
| npm run check        | 포맷 → lint → 타입 → 앱 테스트 → 에이전트 테스트 → 빌드 |

DB 테스트는 준비한 전용 DB의 TEST_DATABASE_URL이 필요하다. 미설정 시 통합 테스트를 건너뛰므로 전체 DB 검증 완료로 간주하지 않는다. CI는 별도 PostgreSQL 서비스를 준비하고 실제 통합 테스트를 실행한다.

## 코드 규칙

- Prettier: 들여쓰기 2칸, 작은따옴표, 세미콜론, LF, 줄 길이 100.
- ESLint: JavaScript·TypeScript 추천 규칙과 React Hooks 규칙. 포맷은 Prettier에 맡긴다.
- 사용하지 않는 인자를 Express 오류 미들웨어 등에서 유지해야 하면 이름 앞에 _를 붙인다.
- 오류 경계는 unknown과 필요한 필드의 타입 확인을 사용한다.
- 이름: React 컴포넌트·타입은 PascalCase, 변수·함수는 camelCase. 기능별 모듈 분리는 다음 단계에서 수행한다.
- .editorconfig는 편집기 설정, .gitattributes는 저장소 줄바꿈을 고정한다.
- 기존 코드를 한 번 포맷하여 이후 포맷 검사가 재현되도록 한다. 기능·SQL·화면 동작의 변경은 최소화한다.

## 작업 절차

GitHub 이슈 → 이슈 번호 브랜치 → 구현 및 커밋별 docs/changes 기록 → 검증 후 PR → 자동 코드 리뷰(최대 2회) → CI 통과 후 병합(#128 이전에는 사용자 직접 병합). 스킬 PR #2는 별도 검토 대상이며 이 PR에서 대신 병합하지 않는다.

## 공식 근거

- [Node.js 릴리스](https://nodejs.org/en/about/previous-releases)
- [typescript-eslint 설정](https://typescript-eslint.io/getting-started/)
- [Prettier 설치와 잠금 파일](https://prettier.io/docs/install)
