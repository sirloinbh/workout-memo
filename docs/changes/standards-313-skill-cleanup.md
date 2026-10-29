# workout-communication을 중앙 공통 스킬로 바꾸기 (sirloinbh/project-standards#313)

## 목적

한국어 보고 규칙(`workout-communication`)이 중앙 공통 스킬 `std-communication`이 되었다. 같은 내용을 두 곳에 두지 않도록 앱 스킬을 지운다.

## 변경

| 파일                                                                     | 내용                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| `skills/workout-communication/`, `.claude/skills/workout-communication/` | 삭제                                            |
| `AGENTS.project.md`                                                      | 사용자 설명 언어는 `std-communication`을 따른다 |

## 순서

중앙 동기화 PR이 `skills/std-communication/`을 넣은 뒤 이 PR을 병합한다. 먼저 병합하면 그동안 `AGENTS.project.md`의 링크가 없는 파일을 가리킨다.

## 검증

- `node scripts/claude-skills.mjs`: `.claude/skills matches skills/.`
- `workout-communication`을 가리키는 곳은 `docs/changes/133-korean-explanations.md`(지난 기록)만 남았다
