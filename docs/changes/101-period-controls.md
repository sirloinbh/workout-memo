# #101 기간 탭을 SegmentedControl로 교체 (1단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-period-feedback-controls`

## 목적

#101은 대시보드·일지·일지 편집을 공통 기준으로 교체합니다. `Workspace` 한 컴포넌트가 1,500줄이고 main 병합이 곧 운영 배포라 작은 단위로 나눕니다. 이 PR은 1단계이며 #101을 닫지 않습니다.

## 변경 — feat: 기간 탭 교체

- `frontend/src/app.tsx`: 대시보드·운동 일지·신체 기록의 기간 탭을 `SegmentedControl`로 바꿨습니다.
- `frontend/src/analysis.tsx`: 종목 분석의 주 탭도 같은 컴포넌트로 바꿨습니다. #102 범위지만 같은 `.tabs` 요소라 함께 옮겼습니다.
- 동작 변경: 탭은 버튼에서 라디오 그룹(`기간`, `분석 기간`)이 됩니다. 이미 선택한 "직접 선택"을 다시 눌러도 입력 중인 시작일·종료일이 지워지지 않습니다.
- 체감 피드백은 그대로 둡니다. 다시 누르면 해제되어 "항상 하나 선택"인 `SegmentedControl`과 맞지 않습니다.
- `.tabs` 규칙은 체감 피드백이 아직 쓰므로 지우지 않았습니다.

## 테스트

- 기간 탭을 찾는 화면 테스트와 e2e를 `button`에서 `radio`로, `selected` 클래스 확인을 `toBeChecked()`로 바꿨습니다. 같은 의미로 검증합니다.
- `npm run test -w frontend`: 195 pass, 2 fail, 4 skip. 실패 2건은 `routines.test.tsx`의 5초 시간 초과입니다. 그 파일만 단독으로 돌리면 8건 모두 통과합니다. 기간 탭을 쓰지 않는 테스트이고, 이 PC의 전체 실행 부하 때문으로 봅니다. CI에서 다시 확인합니다.
- `npm run typecheck`, `npm run lint`: 통과
