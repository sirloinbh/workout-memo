# #102 종목 분석의 기간 줄과 오류 배너를 공통 컴포넌트로 교체 (5단계)

- 이슈: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- 브랜치: `feat/102-analysis-period`
- 앞 단계: 1단계 [#227](https://github.com/sirloinbh/workout-memo/pull/227), 2단계 [#228](https://github.com/sirloinbh/workout-memo/pull/228), 3단계 [#233](https://github.com/sirloinbh/workout-memo/pull/233), 4단계 [#238](https://github.com/sirloinbh/workout-memo/pull/238)

## 목적

2단계에서 미뤄 둔 종목 분석 화면의 기간 줄과 불러오기 오류 배너를 #224의 `DateStepper`·`RangeSummary`, #223의 `AlertBanner`로 옮기고, 이 화면만 쓰던 `.period-bar`·`.date-control`·`.range-label` 규칙을 지웁니다. #102의 마지막 단계입니다.

## 변경 — feat: 기간 줄과 오류 배너 교체

- `frontend/src/analysis.tsx`
  - 기간 줄: 대시보드와 같은 배치(`flex flex-wrap justify-between`)에 기존 `SegmentedControl`(1·4·12주)과 `DateStepper`(이름 "분석 기준 날짜")를 둡니다. 이전처럼 이전·다음 이동 버튼 없이 날짜 입력만 있습니다(`onMove` 없음). 좁은 화면에서는 날짜가 탭 아래로 줄바꿈됩니다.
  - 기간 표시: `.range-label` 대신 `RangeSummary`입니다. 글자는 10px에서 12px로 커집니다.
  - 날짜 입력: 이전에는 테두리 없는 11px 입력이었고, 이제 대시보드와 같은 테두리 있는 공통 `Input`(높이 36px, 터치 44px)입니다.
  - 불러오기 오류: `.error` 대신 `AlertBanner`(`role="alert"`)이고 "다시 연결"은 `outline`·`sm` 버튼입니다. 대시보드의 연결 오류와 같은 모양입니다.
- `frontend/src/style.css`: `.period-bar`, `.date-control`(입력 포함), `.range-label`(`span` 포함)과 760px 이하의 같은 규칙을 지웠습니다. `.error`는 다른 화면이 모두 옮긴 뒤 #103 마지막 정리에서 지웁니다(조율 결정).

## 테스트

- 추가: `frontend/src/analysis.test.tsx`에 1개. 불러오기가 실패하면 `AlertBanner`에 오류가 보이고 "다시 연결"로 다시 요청해 배너가 사라지는지, 기간 줄이 `DateStepper`·`RangeSummary`인지 확인합니다.
- 기존: 1·4·12주 탭과 기준 날짜 변경 테스트는 수정 없이 통과합니다(입력 이름 "분석 기준 날짜" 유지).
- `npm run test -w frontend -- src/analysis.test.tsx`: 6 pass
- `npm run typecheck -w frontend`, eslint·prettier(바꾼 파일): 통과
- 시각 기준선과 e2e는 PR CI로 확인합니다. PC 메모리가 부족해 로컬 전체 `npm run check`와 e2e는 돌리지 않았습니다.

## 변경 — fix: 1차 리뷰 보완

- 위 "변경"에 날짜 입력 모양이 바뀐다는 점을 더했습니다. 기간 표시 글자와 날짜 입력이 바뀌어 analysis 시각 기준선 4장(360·390·768·1280)이 바뀔 것으로 봅니다. CI `e2e-visual` 이미지를 확인한 뒤 `visual-baselines` 아티팩트로 갱신합니다.
- "다시 연결" 버튼에 대시보드와 같이 `type="button"`을 붙였습니다.
- 반영하지 않음: 새 테스트가 `data-slot`으로 공통 부품 사용을 확인한다는 nit. 이 단계의 목적이 공통 부품으로 바꾸는 것이라 그 사실을 확인하는 검사로 남겼습니다.
