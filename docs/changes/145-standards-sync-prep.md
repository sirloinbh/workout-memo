# #145 중앙 표준 첫 동기화 준비 (공유 패키지 설치, 빌드 토큰 전달)

- 이슈: https://github.com/sirloinbh/workout-memo/issues/145
- 중앙 추적 이슈: https://github.com/sirloinbh/project-standards/issues/97
- 동기화 PR: https://github.com/sirloinbh/workout-memo/pull/143

## 목적

- 중앙 동기화 PR #143은 `@sirloinbh/*` 공유 패키지 4개가 설치돼 있다고 가정한다. 동기화는 lockfile과 `compose.yaml`을 관리하지 않으므로, 설치와 빌드 토큰 전달을 이 PR에서 먼저 넣는다.
- 공유 패키지는 GitHub Packages에 있어서 `npm ci`에 `read:packages` 토큰이 필요하다. 로컬·CI·서버 이미지 빌드 모두에서 같은 방식으로 토큰을 넘긴다.

## 변경

| 파일                                                            | 내용                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`, `frontend/package.json`, `backend/package.json` | devDependencies 추가. 루트 `@sirloinbh/eslint-config`·`prettier-config`, frontend `tsconfig`·`design-tokens`, backend `tsconfig`. 모두 `1.0.0` 고정                      |
| `package-lock.json`, `frontend/`·`backend/package-lock.json`    | 위 패키지 항목만 추가됐다. 기존 항목의 버전은 바뀌지 않았다                                                                                                              |
| `.npmrc`, `frontend/.npmrc`, `backend/.npmrc`                   | 중앙 동기화본과 같은 내용. `@sirloinbh` 범위를 GitHub Packages로 보내고 토큰은 `NODE_AUTH_TOKEN` 환경 변수에서 읽는다                                                    |
| `frontend/Dockerfile`, `backend/Dockerfile`                     | 중앙 동기화본과 같은 내용. `.npmrc`를 복사하고, BuildKit secret `npm_token`을 `npm ci`에만 마운트한다                                                                    |
| `compose.yaml`                                                  | `api`·`web` 빌드에 `secrets: [npm_token]`, 최상위 `secrets.npm_token.environment: NODE_AUTH_TOKEN`                                                                       |
| `.github/workflows/ci.yml`                                      | `packages: read` 권한, `NODE_AUTH_TOKEN: ${{ github.token }}`, `docker build --secret id=npm_token,env=NODE_AUTH_TOKEN`. #143이 병합되면 중앙에서 펼친 `ci.yml`로 바뀐다 |
| `docs/deployment.md`                                            | 이미지 빌드에 필요한 토큰과 서버 `.env` 위치 안내                                                                                                                        |

## 설치

- 설치 명령: `npm install --ignore-scripts --save-exact -D ...`. 에이전트 훅이 설치를 막으므로 사용자가 스크립트로 실행했다. 토큰은 그 프로세스 안에서만 쓰고 지웠다.
- 버전: 자체 패키지라 14일 규칙의 예외다(project-standards ADR-0004). 게시일은 2026-10-24다.
- subtree lockfile: 임시 디렉터리에 `package.json`·기존 lockfile·`.npmrc`를 복사한 뒤 `npm install --package-lock-only --ignore-scripts --workspaces=false`로 다시 만들었다. 자체 패키지만 추가해서 `--before`는 쓰지 않았고, 기존 항목이 그대로인 것을 diff로 확인했다.
- 점검
  - 네 패키지 모두 install 스크립트와 `dependencies`가 없다. `peerDependencies`는 이미 설치된 버전(eslint 10.12.0, prettier 3.9.10, typescript 5.9.3 등)과 같다.
  - lockfile의 `hasInstallScript`는 기존 esbuild·fsevents·tesseract.js 그대로다.

## 사용자가 할 일

- 서버 `/opt/workout-memo/.env`에 `NODE_AUTH_TOKEN`(`read:packages`만 있는 classic PAT)을 넣는다. 발급·교체는 project-standards `docs/user-steps.md` 4-3을 따른다. 없으면 다음 자동 배포의 이미지 빌드가 실패하고 이전 이미지로 남는다.
- 로컬에서 `npm ci`나 `docker compose build`를 하려면 같은 토큰을 사용자 환경 변수 `NODE_AUTH_TOKEN`으로 둔다. 이미 설치된 `node_modules`로 `npm run check`를 돌릴 때는 필요 없다.
- 이 PR의 병합은 운영 자동 배포를 일으킨다. 앱 코드는 바뀌지 않았다.

## 검증

- `npm run check` 통과(format, lint, contract, typecheck, 백엔드·프론트 테스트, agents·skills·docs 테스트, build).
- 이 PC에는 Docker가 없어 이미지 빌드는 PR CI의 `docker-build`로 확인한다.
