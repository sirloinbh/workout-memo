# #119 활동 파일 가져오기 ① TCX·GPX, 미리보기, 중복 방지

- 이슈: [#119](https://github.com/sirloinbh/workout-memo/issues/119)
- 브랜치: `feat/119-activity-import`
- 근거 조사: #118 `docs/activity-import.md`(PR #265에서 추가)
- 선행: #114(유산소 모델), #115(유산소 화면) 병합됨

## 목적

가민 커넥트 등에서 내보낸 활동 파일을 올려 유산소 기록으로 가져옵니다. 이번 PR ①은 새 패키지 없이 읽을 수 있는 TCX·GPX와 미리보기·중복 방지·일괄 저장을 만듭니다. FIT·ZIP은 패키지 설치(`@garmin/fitsdk`, `fflate`)가 필요해 PR ②로 나눕니다.

| PR  | 내용                                                                    |
| --- | ----------------------------------------------------------------------- |
| ①   | TCX·GPX 읽기, 미리보기(수정·제외·중복 표시), 일괄 저장 API, e2e         |
| ②   | FIT(`@garmin/fitsdk`, `total_timer_time`)와 ZIP(`fflate`). 설치 승인 후 |

## 사용자 결정 (2026-11-08, #119 댓글)

1. 진입점: 유산소 탭 기록 카드 머리글의 "파일 가져오기" 버튼 → 목록 카드 아래 가져오기 카드
2. 미리보기 편집: 표에서는 저장 체크·종류·날짜·시작 시각만. 나머지는 행의 "수정" → 유산소 입력 창(CardioForm)의 미리보기 수정 모드(서버에 보내지 않음)
3. 저장: `POST /api/cardio-sessions/import`가 한 트랜잭션으로 전부 저장하거나 하나도 저장하지 않음. 거절한 행은 행 번호별 이유
4. 중복: 같은 출처+외부 ID는 저장 불가. 출처가 다른 중복 후보(같은 날짜·시작 ±2분·거리 ±1%, 거리가 없으면 시간 ±1%)와 같은 묶음 안의 비슷한 행은 기본 해제와 안내, 사용자가 체크하면 저장
5. GPX 시간은 첫~마지막 포인트(일시정지 포함, 미리보기에 안내). 외부 ID·종류 대응·거리 계산·상승 고도는 아래대로

## 변경 — feat: TCX·GPX 읽기

- `frontend/src/cardio/activity-file.ts`(새 파일): 브라우저 `DOMParser`로 읽습니다. 파일은 서버로 보내지 않고 저장하지도 않습니다(경로에 집 위치가 있음).
  - TCX: 랩의 `TotalTimeSeconds`(타이머 시간, 일시정지 제외) 합, `DistanceMeters` 합, `Calories` 합, 평균 심박은 랩 시간 가중 평균, 최대 심박은 랩 최댓값입니다. `Notes`는 메모로 옮깁니다. 종류는 `Sport`의 Running→러닝, Biking→실외 사이클, Other→기타입니다.
  - GPX: 요약값이 없어 포인트로 계산합니다. 시간은 첫~마지막 포인트, 거리는 세그먼트 안 포인트 사이의 하버사인 거리 합입니다. 세그먼트 사이(신호가 끊긴 구간)는 더하지 않습니다. 심박은 가민 `TrackPointExtension`의 `hr` 평균·최댓값입니다. 종류는 `trk/type`의 낱말(run·walk·hike·cycling·ride·swim·row 등)로 정하고, 모르면 기타입니다.
  - 시작 시각은 UTC를 Asia/Seoul 날짜와 HH:MM으로 바꿉니다(자정을 넘으면 다음 날).
  - 외부 ID는 시작 시각(UTC ISO, 초 단위, `2026-11-01T22:10:05Z`)이고 출처는 `file`입니다. 같은 활동을 TCX와 GPX로 두 번 올려도 ID가 같아 "이미 가져온 기록"으로 막힙니다.
  - 읽지 않는 값: 상승 고도(TCX에는 요약이 없고 GPX는 계산 오차가 큼), 케이던스(러닝 케이던스 단위가 내보내는 곳마다 한 발·두 발로 다름. TCX 자전거 `Lap/Cadence`만 읽음), 랩·GPS 경로(#114 결정).
  - 범위를 벗어난 값(예: 심박 300, 최대 심박이 평균보다 낮음)은 기기 오류로 보고 비워 둡니다. 그 행 전체를 막지 않습니다.
  - 손상된 XML, 다른 형식, 활동·시각이 없는 파일은 파일 이름과 이유를 보여 주고 나머지 파일은 계속 읽습니다.

## 변경 — feat: 미리보기와 중복 방지

- `frontend/src/cardio/cardio-import.tsx`(새 파일): `CardioImport`. 인바디 가져오기(#89)와 같은 카드·가로 스크롤 표·저장 체크 모양입니다.
  - 여러 파일을 한 번에 고르고, 활동을 시작 시각 순으로 보여 줍니다.
  - 표의 열: 저장, 종류(선택), 날짜, 시작, 기록(시간·거리·평균 심박과 파일 이름, 읽기 전용), 확인, 수정
  - 확인 칸: 저장 가능 / 값 오류(공통 계약 메시지) / 이미 가져온 기록 / N행과 같은 활동 / 중복 후보(기존 기록 이름 또는 N행). 앞의 셋은 체크할 수 없고, 중복 후보는 기본 해제이며 체크하면 저장합니다.
  - 중복 확인은 행 날짜의 하루 앞뒤 기간을 `GET /api/cardio-sessions`로 불러와 화면에서 비교합니다. 날짜를 고쳐 범위가 바뀌면 다시 불러옵니다.
  - GPX가 있으면 "일시정지 포함" 안내를 보여 줍니다.
- `frontend/src/cardio/duplicates.ts`(새 파일): `isSameActivity`(같은 출처·외부 ID), `isSimilarActivity`(시작 ±2분, 한쪽에 시작 시각이 없으면 같은 날짜 / 거리 ±1%, 한쪽에 거리가 없으면 시간 ±1%). 나중의 가민·나이키 동기화도 같은 규칙을 씁니다.
  - 손으로 입력한 기록에는 시작 시각이 없는 경우가 많아, 시작 시각이 없으면 같은 날짜로 비교합니다. 후보일 뿐이라 사용자가 체크하면 저장됩니다.
- `frontend/src/cardio/cardio-form.tsx`: 선택 속성 `apply`. 있으면 제목이 "가져올 기록 수정", 버튼이 "미리보기에 반영"이고, 같은 검증을 거친 값을 돌려줄 뿐 서버에 보내지 않습니다. 출처·외부 ID는 그대로 둡니다.
- `frontend/src/cardio/cardio-panel.tsx`: 머리글에 "파일 가져오기"(보조 버튼)를 두고, 누르면 목록 카드 아래에 가져오기 카드를 엽니다. 저장하면 카드를 닫고 "유산소 기록 N건을 가져왔습니다"를 알린 뒤 목록·통계·개인 기록·대시보드 요약을 다시 불러옵니다.
- `frontend/src/cardio/api.ts`: `importCardioSessions`. 중앙 `requestJson`은 오류 메시지만 남겨 행별 이유(`rows`)를 읽지 못하므로, 이 요청은 응답을 직접 읽어 `CardioImportError.rows`로 넘깁니다(중앙 파일은 고치지 않음).

## 변경 — feat: 일괄 저장 API

- `backend/src/routes/cardio.ts`: `POST /api/cardio-sessions/import` `{ sessions: [...] }`(1~200건).
  - 행마다 `POST /api/cardio-sessions`와 같은 스키마로 검증하고, 출처가 `manual`이 아니며 외부 ID가 있어야 합니다. 요청 안에서 같은 출처·외부 ID가 두 번 나오면 뒤의 행을 거절합니다. 하나라도 틀리면 400과 `rows: [{ index, message }]`입니다.
  - 트랜잭션 안에서 이미 저장된 같은 출처·외부 ID를 찾고, 있으면 ROLLBACK 후 409와 그 행 번호입니다. 동시에 같은 활동을 가져와 고유 인덱스에 걸리거나 없는 근력 일지를 연결하면 기존 `appErrors` 메시지(409·400)로 답하고 아무것도 남기지 않습니다.
  - 성공은 201 `{ sessions: [...] }`(보낸 순서)입니다.
  - 200건 한도: 256kb 본문 한도 안에 들어가는 크기입니다. 계정 전체 내보내기(ZIP)는 PR ②에서 나눠 보내는 방식을 정합니다.
- `backend/src/openapi.ts`, `docs/openapi.json`, `docs/api.md`: 새 경로와 응답 형식

## 테스트

- `frontend/src/cardio/activity-file.test.ts`: 가민 형식 TCX(랩 2개)·GPX(세그먼트 2개) 픽스처의 값, 서울 시각 변환(자정 넘김), 종류 대응, 범위 밖 값, 손상·다른 형식 파일 오류, 확장자 없는 파일
- `frontend/src/cardio/duplicates.test.ts`: 같은 활동·중복 후보의 경계(2분·1%, 자정, 시작 시각·거리 없음)
- `frontend/src/cardio/cardio-import.test.tsx`: 여러 파일 미리보기와 읽지 못한 파일 안내, 중복 후보 기본 해제, 이미 가져온 기록 체크 불가, 표·폼 수정이 저장 본문에 반영되고 폼은 요청하지 않음, 거절 시 행별 이유
- `backend/test/cardio.test.ts`: 검증 실패 행 번호(질의 없이), 이미 저장된 활동 → ROLLBACK·409, 성공 시 BEGIN·SELECT·INSERT·COMMIT
- `backend/test/cardio.integration.test.ts`: PostgreSQL에서 저장, 재가져오기 409와 0건 저장, 트랜잭션 안 실패의 전체 롤백
- `e2e/cardio-import.spec.ts`: 390px에서 TCX 선택 → 미리보기 → 저장 → 목록 표시·새로고침 유지, 같은 파일은 체크할 수 없음
- 픽스처(`frontend/src/cardio/fixtures/`)는 가민 내보내기 모양으로 직접 만든 파일입니다. 실제 사람·장소 정보가 없습니다. 실제 가민 파일이 필요해지면 사용자에게 요청합니다(2026-11-08 결정).

## 영향

- 유산소 탭 목록 카드 머리글에 "파일 가져오기" 버튼이 생겨 `journal-cardio` 시각 기준선 4폭이 바뀝니다.
- DB 마이그레이션은 없습니다(#114의 `source='file'`, `external_id`, 고유 인덱스 사용).
