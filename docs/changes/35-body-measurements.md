# #35 feat: 체중·체지방률·골격근량 기록과 기간별 추이

- 이슈: https://github.com/sirloinbh/workout-memo/issues/35
- 브랜치: feat/35-body-measurements
- 작업일: 2026-10-19 (Asia/Seoul)

## 변경 내용

- `database/migrations/008_body_measurements.sql`: `body_measurements` 테이블. `date` UNIQUE(하루 한 기록), `body_weight_kg`·`body_fat_percent`·`skeletal_muscle_kg`는 모두 NULL 허용 `NUMERIC(5,2)`. CHECK로 체중·골격근량 0 초과, 체지방률 0~100, 세 값 중 하나 이상을 강제한다. `CREATE TABLE IF NOT EXISTS`로 재실행해도 안전하다. 운동 일지와 외래키로 연결하지 않는다.
- `backend/src/domain.ts`: `bodyMeasurementSchema`(Zod)와 공용 `dateRange`(조회 기간 검증). 일지 조회 API도 같은 `dateRange`를 사용하며 검증 규칙·메시지는 이전과 같다.
- `backend/src/app.ts`: `GET /api/body-measurements?from&to`(양 끝 포함, 날짜 오름차순), `POST /api/body-measurements`(201), `PUT /api/body-measurements/:id`(전체 교체, 날짜 이동 가능), `DELETE /api/body-measurements/:id`. 응답 지표는 JSON number 또는 null이다.
- `frontend/src/body.tsx`: 신체 기록 화면. 생성·수정 폼, 기간 내 목록(수정/삭제), 지표별 SVG 추이 그래프 3개, 같은 날 운동 볼륨 표시. 새 차트 라이브러리를 추가하지 않았다.
- `frontend/src/main.tsx`: 메뉴에 `신체 기록` 추가. #17 기간 선택(1일/1주/1달/4주/12주, 이전·다음, 기준 날짜)과 범위 표시를 `periodControls`로 묶어 대시보드·운동 일지·신체 기록이 같은 상태(`period`, `anchor`, `from`, `to`)를 공유한다. 기존 화면의 마크업과 동작은 그대로다. 신체 기록 화면은 자체 제목과 `신체 기록 추가` 버튼을 그린다.
- `frontend/src/style.css`: 신체 기록 폼·추이 카드·목록 스타일, 760px 이하 1열 배치.
- `README.md`, `database/README.md`: 기능 설명, 마이그레이션 적용 명령, 정밀도·충돌 정책.

## 정책

- **정밀도·단위**: 체중·골격근량 kg, 체지방률 %. 저장은 `NUMERIC(5,2)`(최대 999.99). API는 소수점 셋째 자리 이상의 입력을 **반올림하지 않고 400으로 거부**해 저장값이 입력값과 같게 한다. UI 입력은 `step=0.01`이며 표시 단위는 API와 같다.
- **범위**: 체중·골격근량은 0 초과 999.99 이하, 체지방률은 0 이상 100 이하. 유한한 JSON number만 허용하며 숫자 문자열·불리언·오버플로(`1e400`)는 400이다.
- **누락값**: 키 생략과 null은 모두 NULL로 저장한다. 추정값을 만들지 않는다. 세 값이 모두 비면 400(서버 Zod + DB CHECK), UI에서도 요청 전에 막는다.
- **같은 날짜 충돌**: POST는 `ON CONFLICT (date) DO NOTHING`으로 처리하며 기존 날짜는 409 `이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요.`를 반환하고 기존 값을 바꾸지 않는다. PUT으로 다른 기록의 날짜로 옮기면 409, 없는 ID는 404다. 수정은 세 지표를 전체 교체하며 생략한 지표는 NULL이 된다.
- **추이 그래프**: 기간 내 기록한 값만 점으로 표시한다. x축은 기간 내 날짜 위치다. 기록은 있으나 해당 지표가 NULL인 날짜에서는 선을 끊는다. 빠진 값을 0으로 그리지 않는다. 기록이 없는 날짜(측정하지 않은 날)는 앞뒤 기록을 선으로 잇는다. 정상/비정상 판정, 권장 범위, 건강 상태 문구가 없다. 2개 이상 기록 시 첫 기록 대비 변화량만 중립적으로 표시한다.
- **운동 볼륨 병기**: 목록의 각 날짜에 같은 날 운동 볼륨(총중량 × 반복 수)을 나란히 표시한다. "인과 관계를 뜻하지 않는다"는 안내를 표시한다.

## 판단 사항

- 반올림 대신 거부를 선택했다. 조용히 값이 바뀌지 않게 하려는 보수적 선택이다.
- 골격근량이 체중보다 큰 입력 같은 지표 간 교차 검증은 하지 않았다. 측정 기기별 정의가 다를 수 있으며, 판정에 가까운 규칙을 추가하지 않았다.
- 상한 999.99는 저장 형식의 한계다. 의학적 기준이 아니다.
- 수정은 ID 기준 PUT이다. 날짜 경로 기반 upsert는 실수로 덮어쓸 위험이 있어 사용하지 않았다. 동시 수정에 대한 버전 검사는 이슈 범위 밖이라 넣지 않았다(마지막 저장이 반영됨).
- 측정하지 않은 날짜 사이를 선으로 잇는 것은 보간 값이 아니라 기록 순서를 보여주는 표시다. 기록에서 해당 지표만 비어 있는 경우는 선을 끊어 "미입력"과 구분했다.

## 테스트

- `backend/test/body-measurements.test.ts`(단위, 가짜 pool): 부분 입력의 NULL 보존·경계값(0%, 100%, 999.99) 허용, 잘못된 값 15종 × POST/PUT과 `1e400`, 잘못된/역전 조회 기간, 잘못된 ID가 저장소 접근 없이 400인지. POST 충돌 409, PUT 고유키 위반 409, 없는 ID PUT/DELETE 404, 조회 기간 양 끝 포함 전달.
- `backend/test/body-measurements.integration.test.ts`(`TEST_DATABASE_URL` 필요, 없으면 skip): 체중만 입력 → null 보존, 같은 날짜 POST 409 및 원본 불변, 잘못된 값 미저장, PUT으로 지표 추가·체중 비우기, 전부 비우는 PUT 400, 윤일 2072-02-29 포함 기간 경계(전날/다음날 제외), 다른 기록 날짜로 이동 409·빈 날짜로 이동 200, 삭제 후 404·같은 날짜 재생성, 새 서버/새 pool에서 72.35·33.05·0 정밀도와 NULL의 지속성, 중복/추정 행 없음. 테스트 소유 날짜(2072-02-01~03-31)만 전후로 정리한다.
- `backend/test/body-ui.test.ts`(기존 vm 렌더링 어댑터): 신체 기록 화면이 기준 날짜·1주/1달·다음 기간 선택을 재사용해 해당 범위로 조회하는지, 지표 NULL에서 선이 끊기고 0으로 그리지 않는지, 범위 밖 기록 제외, 빈 기간의 빈 그래프와 안내, 같은 날 볼륨 병기와 인과 아님 안내, 의학 판정 문구 없음, 빈 입력 차단, 부분 입력 POST 본문의 null, 중복 날짜 409 후 입력 유지, 수정 PUT 전체 교체, 삭제 후 재조회.
- `backend/test/workout-draft-ui.test.ts`: 이 어댑터는 형제 모듈을 명시적으로 스텁하므로 `./routines`와 같은 방식으로 `./body` 스텁 한 줄을 추가했다. 기존 assertion은 바꾸지 않았다.

## 실제 실행 명령과 결과

- 구현 전: `node ../node_modules/tsx/dist/cli.mjs --test test/body-measurements.test.ts test/body-ui.test.ts`(backend, Node 24.21.0) → 8 tests / 1 pass / 7 fail. 스키마 단위 테스트만 통과(스키마를 먼저 추가), API 404와 `신체 기록` 메뉴 부재로 나머지 실패.
- API 구현 후 같은 단위 테스트 4/4 pass. UI 구현 후 `body-ui`·`period-ui`·`routines-ui`·`workout-draft-ui` 실행에서 처음에는 `workout-draft-ui`가 `Unexpected import: ./body`로 실패했고, 스텁 추가 후 47/47 pass.
- 전용 DB `workout_test_35`에 001~004, 008 마이그레이션 적용 후 `npm run check`(코디네이터 제공 `issue-check.ps1 -Issue 35 -Migrate`, Node 24.21.0): 첫 실행은 `README.md`, `database/README.md` Prettier 경고로 EXIT=1. 포맷 후 재실행(마이그레이션 재적용 성공 = 재실행 안전 확인) **EXIT=0**: format:check·lint·typecheck 통과, `npm test` **218 tests / 218 pass / 0 fail / 0 skip**(DB 통합 포함), `test:agents` 162/162 pass, `test:skills` 4/4 pass, frontend·backend build 통과.

## 제한과 남은 확인

- 실제 브라우저에서 그래프 렌더링, 모바일 폭 배치, 숫자 입력의 네이티브 검증, 포커스는 확인하지 않았다(코디네이터 브라우저 확인 대상).
- 동시 수정 충돌(버전 검사)은 없다. 진행 사진·OCR·스마트 체중계 연동·영양은 범위 밖이다.

## 코디네이터 검토·실제 브라우저 확인 — 2026-10-19

- 독립 검토(읽기 전용): 차단 지적 없음. Zod·DB CHECK 이중 검증, `ON CONFLICT (date) DO NOTHING` 기반 409(경합 없음), PUT의 23505→409, 파라미터 쿼리, 날짜 문자열 파서, 누락값 선 끊김, 기존 기간 컨트롤 영향 없음을 확인했다. 참고(P3): POST 409 후 수정 모드로 자동 전환하지 않음(안내 문구로 처리).
- 실제 브라우저(Playwright, 전용 DB `workout_test_35`의 dev 서버):
  - 모바일 390×844: 10/17(세 항목), 10/18(체중만), 10/19(세 항목) 저장 → "신체 기록을 저장했습니다". 같은 10/19 재등록 → "이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요." 서버 조회에서 10/18의 체지방·골격근량은 null. 가로 스크롤 없음.
  - 4주 보기: 체중 선은 세 점을 연결하고, 체지방률·골격근량은 10/18 누락으로 선 없이 점만 표시(0으로 연결하지 않음). 인과 관계·의학적 판정 없음 안내 표시.
  - PC 1440×900: 세 지표 차트·기록 목록·수정/삭제 버튼 배치 정상.
  - 관찰(기존 동작): #34의 로컬 일지 초안 복구 안내가 신체 기록 화면 하단에도 표시된다. 이 작업의 변경이 아니며 후속 판단 사항으로 남긴다.
