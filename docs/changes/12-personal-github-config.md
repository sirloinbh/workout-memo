# #12 개인 GitHub 인증 설정 연결

- 이슈: https://github.com/sirloinbh/workout-memo/issues/12
- 목적: 회사 기본 gh와 분리된 기존 sirloinbh 개인 인증을 이 프로젝트에서 재사용한다.

## 변경

- 프로젝트 gh 래퍼, VS Code 터미널, 계정 B 실행기의 이 프로젝트 분기는 `%USERPROFILE%/.config/gh-personal`을 사용한다.
- 설치 스크립트 위치 `%LOCALAPPDATA%/gh-workout-memo`는 인증 설정 위치와 구분해 유지한다.
- 다른 프로젝트 실행 시 기존 GitHub 환경을 보존한다. 계정 명시, 상속 토큰 차단, 부모 환경 복원, 인자·종료 코드·stdin 전달을 유지한다.
- AGENTS.md와 인증 운영 문서에 ghp 또는 프로젝트 래퍼 사용 및 기존 개인 인증 재사용 원칙을 반영했다.

## 실제 검증

- Windows `node --test scripts/test/project-github-auth.test.mjs`: 종료 코드 0, 15 통과, 실패·건너뜀 0. 임시 HOME/USERPROFILE/LOCALAPPDATA와 가짜 gh·code만 사용했다.
- `npm run check`: 종료 코드 0. 포맷·lint·타입 검사·빌드 통과, 백엔드 4 통과(전용 테스트 DB 통합 테스트 포함), 워커 34 통과, 건너뜀 0.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/12 diff --check`: 종료 코드 0.
- 구현 전 예상 실패와 단계별 작업 내역은 [12-agent-task.md](12-agent-task.md)에 기록했다.

## 남은 작업

독립 검토 후 코디네이터가 커밋·푸시·PR을 담당한다. 실제 사용자 설치본 갱신 및 최종 Git 인증 확인은 주 대화에서 진행한다. 워커는 실제 인증 설정·회사 설정·전역 gh/ghp·사용자 설치본을 변경하지 않았다. PR 병합은 사용자만 수행한다.
