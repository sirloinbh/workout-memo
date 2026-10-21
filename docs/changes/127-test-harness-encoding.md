# #127 비-ASCII 경로에서 project-github-auth 테스트 하네스 인코딩 실패

- 이슈: [#127](https://github.com/sirloinbh/workout-memo/issues/127)
- 브랜치: `fix/127-test-harness-encoding`

## 목적

저장소가 `...\OneDrive\문서\...`처럼 비-ASCII 문자가 든 경로에 있으면 `scripts/test/project-github-auth.test.mjs`의 6건이 실패했다. 임시 하네스(`.ps1`·`.cmd`)에 저장소 스크립트의 절대 경로를 문자열로 박아 넣었는데, Windows PowerShell 5.1은 BOM 없는 `.ps1`을 시스템 ANSI 코드페이지(CP949)로 읽어 `문서`가 `???`로 깨졌다.

## 변경 — 2026-10-22

- 이슈 본문의 BOM 기록 방식 대신 경로를 하네스 파일에 쓰지 않는 방식으로 고쳤다.
  - `cmd.exe`는 UTF-8 BOM을 건너뛰지 않고 명령으로 해석한다. 그래서 BOM으로는 `.cmd` 하네스(`launcher preserves another project ...`)를 고칠 수 없다.
  - 하네스 본문을 파일 상단의 `harnesses` 상수로 모으고 ASCII만 쓴다. 경로는 `TEST_WRAPPER`·`TEST_TERMINAL_INIT`·`TEST_LAUNCHER`·`TEST_OTHER_PROJECT` 환경변수로 전달한다. 환경변수는 UTF-16으로 끝까지 전달되므로 코드페이지 영향을 받지 않는다.
- 회귀 테스트 `harness scripts stay ASCII-only so a non-ASCII checkout path still runs them`을 추가했다. 모든 하네스가 ASCII 전용인지, 저장소 경로를 포함하지 않는지, 경로를 환경변수에서 읽는지 검사한다. ASCII 경로 머신에서도 회귀를 잡는다.
- 제품 코드(`scripts/gh-project.ps1`, `scripts/project-terminal.ps1`)는 바꾸지 않았다.

## 검증

로컬(Windows 11, 저장소 경로 `C:\Users\kimbh\OneDrive\문서\github\workout-memo`).

- `node --test scripts/test/project-github-auth.test.mjs`: 18 pass, 0 fail, 0 skip(기존 17건 + 회귀 1건). 수정 전에는 6건이 실패했다.
- 회귀 확인: `restore` 하네스에 저장소 절대 경로를 다시 넣자 회귀 테스트가 `restore harness must stay ASCII-only`로 실패했다. 원복 후 통과.
- `origin/main`(#130 병합 `5875ad3`)으로 fast-forward한 뒤 다시 실행했다. #130의 새 devDependency 때문에 `npm ci --ignore-scripts`로 의존성을 맞췄다.
- `npm run check`(DB 없음)
  - format·lint·contract·typecheck 통과
  - 백엔드 206 pass / 35 skip(DB 통합 미실행), 프론트 121 pass
  - `test:agents` 165 pass / 2 fail. 실패 2건(`#24 ... crosses the PowerShell and Node boundary`)은 이 PC의 PowerShell 실행 정책 때문이며 이 변경과 무관하다(#130 기록과 동일).
  - 프로세스 한정 `PSExecutionPolicyPreference=Bypass`로 `test:agents`를 다시 실행해 167 pass를 확인했다. 이어서 `test:skills` 4 pass, `test:docs` 3 pass, `build` 성공.
