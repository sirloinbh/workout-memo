# 기술 추천과 적용 기준

이 문서는 사용자가 검토한 개발 기반 추천을 보관한다. 아래 도구는 추천 후보이며 설치 완료 목록이나 사용량 순위가 아니다. 기존 사용자 선택과 해당 이슈의 범위가 우선이다. 현재 구현은 프로젝트 package.json·Compose·CI에서 확인한다.

## 9개 준비 영역

| 영역       | 추천                                                                      | 적용 기준                                                                                                                    |
| ---------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 기술·구조  | React + Vite + TypeScript, Express, PostgreSQL, npm workspaces            | 우산 모노레포에서 개발하고 영역별 저장소 4개는 subtree로 동기화한다.                                                         |
| Git        | GitHub Flow, 이슈 번호 브랜치, PR, squash merge                           | 테스트 후 PR을 열고 자동 리뷰(최대 2회)·CI 통과 시 에이전트가 merge 커밋으로 병합한다. 저장소 설정은 자동으로 바꾸지 않는다. |
| 코드 규칙  | ESLint, typescript-eslint, Prettier, EditorConfig                         | 오류 검사·타입 규칙·포맷·편집기 설정의 역할을 나눈다. 실제 명령과 CI를 함께 준비한다.                                        |
| API 계약   | REST, OpenAPI, Zod                                                        | 요청·응답·오류·단위를 정의하고 서버 입력 검증을 유지한다. 공유 계약 패키지는 실제 중복 제거에 필요할 때 만든다.              |
| 디자인     | Tailwind CSS, shadcn/ui, Lucide                                           | 기존 디자인의 토큰과 필요한 버튼·입력·모달·상태부터 공통화한다.                                                              |
| 개발·검증  | Docker Compose, Vitest, React Testing Library, Playwright, GitHub Actions | 기존 DB 통합 테스트를 유지하고 테스트 목적에 맞게 단계적으로 도입한다. 기존 node:test를 이유 없이 전면 교체하지 않는다.      |
| Codex 지침 | AGENTS.md, docs, 작업별 스킬                                              | 핵심 지침·상세 설계·반복 절차를 구분하고 원본 문서를 참조한다.                                                               |
| 배포·운영  | AWS, Terraform, ECR, CloudWatch, S3, AWS Budgets                          | 이미지·인프라·로그·백업·비용 알림을 준비한다. 실제 배포 범위와 예산을 정한 작업에서 적용한다.                                |
| 기준 기능  | 운동 일지 CRUD                                                            | 날짜·기간 조회, 입력·수정·삭제, 목표 판정까지 관련 동작을 관찰해 검증한다.                                                   |

## 프론트엔드 후보

- React Router: 대시보드·일지·목표·머신 화면의 URL과 이동.
- TanStack Query: 서버 조회·캐시·오류·저장 후 목록 갱신.
- React Hook Form + Zod: 세트 배열과 입력 검증, 항목별 오류.
- Tailwind CSS + shadcn/ui: 공통 UI와 디자인 토큰. 현재 CSS를 보존하며 필요한 범위에서 도입.
- Recharts: 볼륨·중량 변화 차트가 요구될 때 도입.

## DB 접근과 계약

현재 pg + SQL을 활용한다. 마이그레이션 적용 이력은 #58에서 `schema_migrations`와 `npm run db:migrate`로 도입했다. 기능별 라우트 모듈(`backend/src/routes/`)과 REST 계약 문서(`docs/api.md`)도 같은 작업에서 정리했다. OpenAPI 생성과 공유 Zod 계약 패키지는 실제 중복 제거가 필요할 때 별도 이슈로 도입한다. #60에서 Vitest·React Testing Library·Playwright를 도입해 화면 테스트를 실제 DOM으로 옮기고 일지 CRUD 브라우저 검증을 CI에 연결했다. #62에서 React Router(페이지 URL)와 TanStack Query(대시보드·일지·목표·머신 조회)를 도입했다. #64에서 공유 Zod 계약(`shared/contract.ts` 원본, backend·frontend 복제)과 React Hook Form(목표 폼), 일지·머신 폼의 저장 전 항목별 검증을 도입했다. #66에서 디자인 토큰(`theme.css`), Tailwind CSS 4(Preflight 제외), shadcn/ui 방식 공통 컴포넌트(`components/ui`)를 도입했고 변경 전후 화면이 픽셀 단위로 같음을 확인했다. Prisma는 ORM 전환을 요청받았을 때 검토할 후보이다. 전환 시 기존 DB baseline과 데이터 보존을 검증하고, database와 backend에서 서로 다른 마이그레이션 원본을 동시에 운영하지 않는다.

날짜는 `YYYY-MM-DD`, 서비스 시간대는 `Asia/Seoul`. 머신 기본중량은 확인된 값만 입력한다. 운동 중량은 기본중량 포함 총중량 kg이며, 목표는 기간 내 동일 운동의 한 세트가 목표 중량과 횟수를 모두 충족했는지 서버에서 판단한다.

## AWS 배포 후보

- 개인용 첫 배포: EC2 + Docker Compose + PostgreSQL, S3에 별도 백업. 서버·DB·백업 복구를 직접 운영한다.
- 관리형 확장: ECS Fargate + ECR + RDS PostgreSQL + ALB. 상시 비용과 구성 범위가 늘어나므로 목적에 맞게 선택한다.
- 로그인 없는 앱은 본인만 접속 가능한 경로를 함께 설계한다. localhost에서 사용하는 구성과 외부 접속 가능한 운영 구성을 구분한다.
- 비용 알림은 지출 차단 기능이 아니다. 로그 보존 기간·이미지 보관·백업 보관과 복구 절차를 운영 문서에 기록한다.

## 추천 적용 순서

진행 상태는 PR 생성 기준이며 병합 여부는 GitHub에서 확인한다.

1. Node.js LTS·npm·잠금 파일, 코드 포맷·정적 검사·통합 검사 명령 고정. 이전 추천은 Node.js 24 LTS였으며 실제 도입 시 지원 상태와 패키지 호환성을 다시 확인한다. — #4 완료.
2. 기능별 구조, 공유 계약, API·DB 마이그레이션 문서 정리. — #58(마이그레이션 이력·라우트 모듈·REST 문서), #64(공유 Zod 계약), #68(OpenAPI).
3. 공통 UI, 라우팅, 서버 데이터·폼 상태 관리 도입. — #62(React Router·TanStack Query), #64(React Hook Form), #66(토큰·Tailwind·공통 컴포넌트).
4. 일지 CRUD의 브라우저 검증과 PR CI 연결. — #60(Vitest·RTL·Playwright, CI e2e).
5. 첫 배포, 상태 확인, 로그, 백업·복원, 이전 이미지 복구. — 대기: 운영 환경·접속 방식·예산을 사용자가 결정해야 한다.
6. 확인한 반복 절차를 지침·스킬에 반영. — #70([검증된 반복 절차](procedures.md)).

## 공식 참고 자료

- [개발자 도구 사용 조사](https://survey.stackoverflow.co/2025/technology)
- [Node.js 지원 일정](https://github.com/nodejs/Release)
- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [OpenAPI](https://spec.openapis.org/oas/latest.html)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [React Hook Form·Zod 예제](https://ui.shadcn.com/docs/forms/react-hook-form)
- [Prisma](https://www.prisma.io/docs/orm/core-concepts)
- [Playwright](https://playwright.dev/docs/intro)
- [ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
- [RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [스킬](https://learn.chatgpt.com/docs/build-skills)
