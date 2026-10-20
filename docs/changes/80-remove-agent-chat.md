# #80 워커 Codex 채팅 연동(#48 1단계) 제거

- 이슈: [#80](https://github.com/sirloinbh/workout-memo/issues/80)
- 브랜치: `chore/80-remove-agent-chat`

## 배경 — 2026-10-20

사용자가 워커 Codex 채팅 연동 이슈 #43을 삭제하도록 요청했고, 이어서 관련 코드와 문서도 걷어내도록 요청했다.

- 이슈 #43은 GitHub에서 삭제했다. 되돌릴 수 없고, 이슈 코멘트 기록도 함께 사라졌다.
- 1단계 구현은 PR #48(병합 커밋 `541b6d5`)로 main에 들어와 있었다. 실제 Codex 채팅 전송은 연결되지 않은 상태였다.

## 변경

`git revert -m 1 541b6d5`로 PR #48의 변경을 되돌렸다.

- **삭제한 파일**
  - `scripts/agents/conversation.mjs`: 이벤트·판단 요청·응답 기록
  - `scripts/agents/decision-schema.mjs`
  - `scripts/test/agent-conversation.test.mjs`, `scripts/test/agent-conversation-cli.test.mjs`
- **복원한 부분**: `scripts/agents/cli.mjs`·`workflow.mjs`·`scripts/agents.ps1`의 이벤트 기록과 `respond` 명령 경로를 #48 이전 상태로 되돌렸다. `agent-publication-resume`·`agent-workflow` 테스트의 연동 부분도 함께 되돌렸다.
- **문서**
  - `docs/local-agent-workflow.md`의 판단 요청·respond 안내를 #48 이전 문장으로 되돌렸다.
  - AGENTS.md: "채팅 메시지가 없을 때 워커 상태를 이 대화에 자동으로 보내는 기능은 없다"로 되돌렸다.
  - next-steps의 #43 항목을 삭제했다.
- **충돌 해결**: `package.json`은 이후 PR들이 추가한 스크립트(`test`, `db:migrate`, `openapi`, `test:e2e`, `contract:*`)를 유지하고, `test:agents` 목록에서 `agent-conversation-cli.test.mjs`만 뺐다.
- **유지한 것**: 과거 변경 기록 `docs/changes/43-agent-task.md`와 일일 기록은 이력으로 남겼다(revert가 지우려던 변경 기록을 복원).

## 검증

| 검사                                                                                                                                    | 결과                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `npm run test:agents`                                                                                                                   | **162 pass / 0 fail / 0 skip** (#48 이전과 같은 수) |
| 코드·문서 잔여 참조 검색(`conversation.mjs`, `decision-schema`, `awaiting_user`, `respond -Issue`, `Codex 채팅`, `#43`, 과거 기록 제외) | 0건                                                 |

`npm run check`: **EXIT=0**. 결과: 백엔드 279, 프론트 89, 워커 162, 스킬 4 모두 pass, fail·skip 0.

## 영향

- 로컬 워커는 PR 게시 후 이벤트나 판단 요청을 영속 기록하지 않는다. `respond` 명령도 없다.
- 워커 상태 확인은 기존처럼 `./scripts/agents.ps1 status`로 한다.
- `.local/agent-workflow/`에 남은 과거 이벤트 파일이 있더라도 읽지 않는다. 무시되는 경로라 저장소에는 영향이 없다.
