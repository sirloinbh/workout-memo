# #136 포트를 중앙 표준(슬롯 01)으로 바꾸고 AGENTS 고유 규칙 분리

- 이슈: https://github.com/sirloinbh/workout-memo/issues/136
- 중앙 추적 이슈: https://github.com/sirloinbh/project-standards/issues/95

## 목적

- 8개 앱의 포트가 서로 겹치지 않도록 중앙 레지스트리가 다시 배정한 포트(슬롯 01)를 적용한다. 지금은 Vite 기본 포트 5173이 health-log와, e2e 웹 포트 5174가 life-journal Vite와 겹친다.
- 중앙 표준 첫 동기화가 AGENTS.md를 공통 지침으로 바꾸기 전에, 이 프로젝트만의 규칙을 AGENTS.project.md로 옮겨 보존한다.

## 변경

| 종류      | 이전              | 이후                | 바꾼 파일                                                                                                                                   |
| --------- | ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 웹        | 8088              | 8101                | `compose.yaml`, `README.md`, `docs/api.md`, `docs/deployment.md`, `docs/shared-hosting-costs.md`                                            |
| API       | 3001              | 3101                | `compose.yaml`, `backend/src/server.ts`, `backend/Dockerfile`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `.env.example`, README 2개 |
| Vite      | 5173 (지정 안 함) | 5201 (`strictPort`) | `frontend/vite.config.ts`, `README.md`                                                                                                      |
| 호스트 DB | 55432             | 15401               | `compose.yaml`, `.env.example`, `database/README.md`, `docs/deployment.md`                                                                  |
| e2e API   | 3101              | 3201                | `playwright.config.ts`, `AGENTS.project.md`                                                                                                 |
| e2e 웹    | 5174              | 5301                | `playwright.config.ts`, `AGENTS.project.md`                                                                                                 |

- `docs/ai-agent-project-setup.md`의 포트 예시를 새 값과 중앙 슬롯 공식으로 바꿨다.
- `docs/changes/`, `docs/daily/`, `docs/ux-audit/`, `docs/next-steps/`의 과거 기록은 당시 상태라서 고치지 않았다.
- **AGENTS 분리:** 서비스 규칙(중량·NULL), PR 자동 리뷰·병합 규칙, 계정·도구, 현재 구현, 고유 스킬·디자인, 고유 검증 명령, 로컬 에이전트 작업을 `AGENTS.project.md`로 옮겼다. 문장은 바꾸지 않았고, 옮긴 e2e 포트만 새 값으로 바꿨다. `AGENTS.md`에는 공통 내용만 남기고 `AGENTS.project.md`를 반드시 읽게 했다.

## 사용자가 할 일

- 로컬 `.env`의 `DATABASE_URL` 포트를 `55432`에서 `15401`로 바꾼다. `.env`는 커밋하지 않으므로 이 PR이 바꾸지 않는다.
- 운영 서버는 `.env`의 `WEB_BIND`·`WEB_PORT`로 웹 포트를 정하므로 영향이 없다. API 내부 포트(3101)는 compose·nginx·Dockerfile이 함께 바뀐다.

## 검증

- `npm run check` 결과는 아래 PR 본문에 적는다.
- e2e(포트 3201·5301)는 PR CI에서 확인한다. 로컬에는 테스트 DB가 없어서 실행하지 않았다.
