# #140 주 시작 요일 예외 기록과 #200 다음 작업 갱신

- 이슈: [#140](https://github.com/sirloinbh/workout-memo/issues/140), [#200](https://github.com/sirloinbh/workout-memo/issues/200)
- 브랜치: `docs/140-week-start-exception`

## 목적

중앙 공통 규칙은 일요일 시작 주이고 이 앱은 월요일 시작 주입니다. 어느 쪽인지 정해 코드와 지침을 맞춥니다. 사용자가 선택지는 추천안으로 진행하라고 맡겼습니다.

## 변경 — docs: 예외 기록

- `AGENTS.project.md`: 한 주는 월요일에 시작한다는 예외와 이유를 적었습니다.
- 코드는 바꾸지 않았습니다. 달력 주를 쓰는 `backend/src/analysis.ts`의 `mondayOf`, `frontend/src/analysis.tsx`, `frontend/src/app.tsx`의 `week` 기간이 이미 월요일 기준입니다. 일요일 시작 주를 쓰는 코드는 없습니다.
- 이슈 본문과 달리 목표 종료일 기본값은 항상 일요일이 아닙니다. 조회 기간의 끝(`deadline={to}`)이라 1주 기간에서만 일요일입니다. 루틴 N주차는 달력 주가 아니라 시작일부터 센 7일입니다.
- next-steps에서 project-standards#363을 뺀 것은 닫혔기 때문입니다(2026-11-01 조회).
- `docs/daily/2026-11-01.md`, `docs/next-steps/README.md`: 오늘 결과와 다음 작업을 갱신했습니다.

## 검증

앱 동작 변경이 없어 테스트를 추가하지 않았습니다.

- 코드 검색으로 주 시작 요일을 쓰는 곳을 확인했습니다.
- 전체 검사는 PR CI로 확인합니다.
