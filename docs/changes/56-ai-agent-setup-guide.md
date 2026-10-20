# #56 새 웹앱 프로젝트용 AI 에이전트 개발 환경 설정 문서

- 이슈: [#56](https://github.com/sirloinbh/workout-memo/issues/56)
- 브랜치: `docs/56-ai-agent-setup-guide`

## 목적

이 프로젝트에서 운영·검증한 개발 환경을 새 웹앱 프로젝트의 AI 에이전트에게 문서 하나로 전달해, 받은 즉시 세팅을 시작할 수 있게 한다.

## 변경

- `docs/ai-agent-project-setup.md` 신설. 구성은 다음과 같다.
  - 0장: 시작 전 확인할 자리표시자(`<app>`, `<owner>`, 포트, 시간대, 리전, 예산, 도메인 규칙).
  - 1장: 에이전트 절대 규칙(npm 설치 사용자 확인, 사용자 전용 병합, 비밀값, 명시 stage, 미실행 검사 구분, 모호한 요구 확인).
  - 2장: 언어·문서 규칙.
  - 3장: 기술 스택. 현재 적용 버전과 추천·미도입 후보를 구분한다.
  - 4장: 우산 모노레포와 subtree 하위 저장소 4개, 디렉터리 배치.
  - 5장: 실제 설정 파일 내용(`.npmrc`, `.editorconfig`, `.gitattributes`, 루트 `package.json`, Prettier, ESLint, tsconfig, Compose, Dockerfile, nginx, `.env.example`).
  - 6장: API·저장 안전성(멱등 키·버전)·마이그레이션 규칙.
  - 7장: 테스트 종류와 통합 CI.
  - 8장: 디자인 토큰·컴포넌트·반응형·접근성.
  - 9장: Git 전략.
  - 10장: AI 지침 체계(AGENTS.md 템플릿, CLAUDE.md, 스킬과 `.claude/skills` 동기화, 계정 분리, 선택형 로컬 워커).
  - 11장: 13단계 부트스트랩 체크리스트.
  - 12장: AWS Terraform 초안과 배포 대안·비용.
  - 13장: 이 프로젝트에서 확인된 함정 10개.
  - 14장: 대조할 원본 파일 목록.
- 설정 값은 현재 `main`의 실제 파일에서 옮겼다. 하위 저장소 CI 설명은 `backend/.github/workflows/ci.yml`과 대조해, backend는 `npm test`까지 실행한다는 점을 반영했다. 미도입 도구(React Router, TanStack Query, Tailwind/shadcn, Vitest, Playwright 자동 테스트, Prisma, OpenAPI)는 [추천·미도입]으로 따로 표시했다.
- 디자인 토큰은 `frontend/src/style.css`에서 자주 쓰는 색·반경·글꼴·중단점을 뽑았다. 새 프로젝트에서는 CSS 변수로 정의할 것을 권고했다(현재 프로젝트는 색을 직접 써 공통화가 어려웠음).
- README에서 새 문서로 가는 링크를 추가했다.

## 검증

- 문서 전용 변경이며 앱 동작 변경이 없어 앱 테스트를 추가하지 않았다.
- 설정 블록을 실제 파일(`package.json`, `.npmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `eslint.config.mjs`, tsconfig 3개, `vite.config.ts`, `compose.yaml`, `.env.example`, Dockerfile 2개, `nginx.conf`, `.github/workflows/ci.yml`, 하위 저장소 CI 3개, `infrastructure/*.tf`)과 대조했다.
- 결과는 아래에 기록한다.
- Prettier `--write`로 세 문서를 포맷했다(표 정렬). 문서 내부 앵커 링크(`#11-부트스트랩-체크리스트`)와 README의 새 링크가 유효함을 스크립트로 확인했다.
- 호스트 Node 24.21.0 / npm 11.19.0, 전용 테스트 DB로 `npm run check`: **exit 0**. 앱·DB 209 pass / 0 fail / 0 skip, 워커 162 pass, 스킬 4 pass, 포맷·lint·타입·빌드 통과.
- 문서대로 새 프로젝트를 실제로 처음부터 만들어 보는 검증은 하지 않았다(새 저장소 생성·패키지 설치가 필요하고, 사용자 확인 대상이다).

## 함정 2건 추가 — 실제 프로젝트 7개 세팅에서 확인 (2026-10-19)

- 이 문서로 study-log 등 7개 프로젝트를 세팅하면서 새로 확인한 함정을 13장에 추가했다.
  - backend 하위 저장소 CI가 `../../frontend`를 읽는 UI 테스트 때문에 실패하는 문제(study-log #1에서 수정).
  - PowerShell 5.1에서 네이티브 stderr·빈 문자열 인자·한글 `.ps1` 처리 문제.
- 포맷 검사만 해당하는 문서 변경이다. `prettier --check` 통과.
