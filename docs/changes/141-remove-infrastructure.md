# #141 infrastructure 폴더와 관련 설정 제거

- 이슈: https://github.com/sirloinbh/workout-memo/issues/141
- 중앙 추적 이슈: https://github.com/sirloinbh/project-standards/issues/94

## 목적

- 인프라 원본을 `sirloinbh/shared-aws-infrastructure`로 옮겼다(sirloinbh/shared-aws-infrastructure#4). 원본이 두 곳에 있으면 이력이 갈라지므로 이 리포의 복사본을 지운다.
- 이 리포의 `infrastructure/`는 이미 원본보다 뒤처져 있었다(AWS provider v5, 원본은 v6.68.0).

## 변경

| 파일                                                               | 내용                                                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/`                                                  | 삭제                                                                                                                                                                                    |
| `.github/workflows/ci.yml`                                         | `terraform` 작업을 `deploy-scripts` 작업으로 바꿨다. `deploy/*.sh`의 `bash -n`만 남겼다                                                                                                 |
| `scripts/push-repositories.ps1`, `scripts/create-repositories.ps1` | subtree 대상에서 infrastructure를 뺐다                                                                                                                                                  |
| `eslint.config.mjs`, `.prettierignore`                             | `infrastructure/.terraform` 무시 항목 삭제                                                                                                                                              |
| `AGENTS.md`, `AGENTS.project.md`                                   | subtree 목록에서 infrastructure를 빼고, 인프라 변경은 shared-aws-infrastructure의 지침을 따르도록 바꿨다                                                                                |
| `README.md`                                                        | 저장소 구성과 운영 안내의 인프라 경로 수정. "자동 운영 배포는 아직 연결되지 않았습니다" 문장은 #75 이후 사실이 아니라 뺐다                                                              |
| `docs/deployment.md`                                               | 구성과 비용, 준비, 인프라 적용, 허용 IP, 알람, 철거를 shared-aws-infrastructure `docs/operations.md` 안내로 대체했다. 앱 배포·롤백·자동 배포·접속·백업 복원은 그대로 두고 번호만 당겼다 |
| `skills/workout-foundation/references/procedures.md` (+ 복제본)    | 영역별 독립 빌드 목록에서 infrastructure 삭제                                                                                                                                           |

- `docs/ai-agent-project-setup.md`(새 프로젝트 구성 안내), `docs/shared-hosting-costs.md`, `docs/changes/`, `docs/daily/`는 당시 기록이라 고치지 않았다.

## 사용자가 할 일

- 로컬에 `infrastructure` remote가 등록된 PC가 있으면 지운다. 이 PR은 로컬 설정을 바꾸지 않는다.
- 이 PR의 병합은 운영 자동 배포를 일으킨다. 앱 코드는 바뀌지 않았다.

## 검증

- `npm run check` 결과는 PR 본문에 적는다.
