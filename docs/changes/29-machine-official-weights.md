# #29 feat: 머신 공식 공무게(시작 저항) 참고 테이블

- 이슈: https://github.com/sirloinbh/workout-memo/issues/29
- 브랜치: feat/29-machine-official-weights
- 확정 범위(2026-10-19 사용자 댓글): 문서 표와 앱 머신 선택 화면의 공식값 표시

## 조사 방법

- 대상은 Arsenal Strength, Hammer Strength, Newtech(뉴텍) 온힘 라인업이다. 제조사 공식 제품 페이지·카탈로그·매뉴얼만 공식 자료로 인정했다. 판매처·블로그·커뮤니티·사용자 실측값은 공식값으로 쓰지 않았다.
- WebSearch·WebFetch로 웹 조회를 약 37회 수행했다. 조회한 페이지는 데이터로만 다루었으며 파일을 내려받거나 실행하지 않았다.
- Hammer Strength: Life Fitness 공식 en-us Plate-Loaded 카탈로그에서 41개 모델을 확인했다. 그중 25개 제품 페이지의 `Product Code`와 `Starting Resistance`를 직접 조회해 기록했다. 나머지 16개는 조사 상한으로 조회하지 못했다.
- Arsenal Strength: 제조사 공식 사이트를 찾지 못했다. `arsenalstrength.com`은 무관한 체육관 사이트였고 `www.arsenalstrength.net`은 DNS 조회에 실패했다. 판매처(Performaxx) 수치는 채택하지 않았다.
- Newtech 온힘: `www.ntws.co.kr`이 국문·영문 모두 HTTP 403을 반환했다. 온힘 라인업의 존재와 모델 목록은 공식 자료로 확인하지 못했다.
- 결과: 조사 56행(모델 53개). 공식값 확인 28행(모델 25개. Seated Biceps `conflict` 1행 포함), 미확인 NULL 28행(Hammer 16, Arsenal 11, Newtech 1). 공식 0 kg 값은 없었다. 상세 표와 기준은 [docs/machine-official-weights.md](../machine-official-weights.md)에 있다.

## 변경 내용

- `database/migrations/009_official_machine_weights.sql`: `official_machine_weights` 참고 테이블을 추가했다. 브랜드, 라인업, 모델 번호, 모델명, 공식 항목명, 설정, 상태, 원문 값·단위, 제조사 kg 표기, kg 환산, 기준, 공식 URL, 확인일, 비고를 둔다.
  - CHECK 제약: 확인값은 단위, kg, 기준, https 출처가 필수다. 미확인 값은 NULL(0 금지)이며 사유가 필수다. 불일치 행도 사유가 필수다.
  - `machines.official_weight_id`를 선택 연결 열로 추가했다(`ON DELETE SET NULL`).
  - 시드는 `ON CONFLICT ... DO UPDATE`로 멱등이다. `machines.base_weight`와 `sets.weight`는 변경하지 않는다.
- `backend`:
  - 새 엔드포인트 `GET /api/official-machine-weights?brand=`: Zod strict 검증을 적용해 빈 값, 중복 값, 알 수 없는 파라미터, 120자 초과 입력을 400으로 거부한다.
  - `GET /api/machines`: 연결된 참고값의 상태, 값, 기준, 출처, 확인일을 함께 반환한다.
  - 머신 POST/PUT: `official_weight_id`(양의 int4 또는 null, 기본 null)를 저장한다. 존재하지 않는 참고값은 FK 위반 400을 반환한다.
- `frontend/src/main.tsx`, `style.css`:
  - 머신 등록·수정 화면: 선택한 브랜드의 "공식 참고값 (선택)"을 고를 수 있다. 값, 기준(편측/기준 미표기), 모델 번호, 공식 항목명, 제조사 kg 표기, 공식 출처 링크, 확인일, 비고를 표시하고 "기본중량에 자동 반영되지 않습니다"라고 안내한다.
  - 미확인 값은 "공식값 미확인", 불일치 행은 "공식 자료 간 불일치"로 표시한다. 브랜드를 바꾸면 다른 브랜드의 참고값 연결을 해제한다.
  - 머신 라이브러리 행과 일지의 머신 선택 항목에 연결된 "공식 참고값"을 사용자 기본중량과 따로 표시한다.
  - 참고값 조회가 실패해도 일지·머신 데이터는 계속 표시하고, 폼에 실패 안내를 표시한다.
- `docs/machine-official-weights.md`: 조사 기준, 방법, 범위, 집계, 표를 추가했다. `database/README.md`: 009 적용 방법을 추가했다.

## 테스트

- `backend/test/official-weights.test.ts`(DB 없이 실행): 마이그레이션 시드 튜플을 파싱해 다음을 검증한다.
  - 시드 범위는 세 브랜드이며, Newtech는 온힘 라인업만 포함한다.
  - 수치가 있는 모든 행은 lifefitness.com https 출처, 단위, 기준, 제조사 kg 표기를 갖고, kg 값이 `lb×0.45359237` 반올림 결과와 같다.
  - per_arm 기준은 공식 문구에 근거한다.
  - 판매처 출처가 없다.
  - 미확인 행은 NULL이며 사유가 있다.
  - 문서 표와 시드가 일치한다.
  - 마이그레이션이 머신·세트를 갱신하지 않는다.
  - `official_weight_id`를 검증한다.
  - 잘못된 API 쿼리는 저장소 호출 전에 400을 반환한다.
- `backend/test/official-weights.integration.test.ts`(`TEST_DATABASE_URL` 필요): 다음을 검증한다.
  - 참고값을 출처와 함께 조회하고, 미확인 값은 NULL과 사유로 조회한다.
  - DB 제약이 무출처 행, http 출처, 무사유 행, 미확인 0 kg 행을 거부한다.
  - NULL·0·20.25 kg 머신에 참고값을 연결해도 기본중량이 보존된다.
  - 마이그레이션을 두 번 재실행해도 머신 기본중량과 과거 세트 총중량이 그대로이고 시드 행 수가 같다.
  - 연결 변경·해제와 존재하지 않는 참고값 거부 후에도 값이 보존된다.
- `backend/test/official-weights-ui.test.ts`(기존 vm 렌더 어댑터 방식): 다음을 검증한다.
  - 라이브러리에 공식 참고값, 출처 링크, 확인일을 표시하고 기본중량은 "미입력"을 유지한다.
  - 일지 머신 선택 항목에 공식 참고값이 함께 표시된다.
  - 등록 시 참고값을 연결해도 기본중량 입력이 빈 값으로 남고, 요청 본문이 `base_weight: null`, `official_weight_id: 11`이다.
  - 미확인 참고값은 "공식값 미확인"으로 표시하고 0 kg을 표시하지 않는다. 브랜드를 변경하면 연결을 해제한다.
  - 참고값 조회 실패가 화면을 막지 않는다.
- 테스트는 구현과 함께 작성했다. 구현 전 실패를 별도로 관찰하지는 않았다.

### 실제 실행 결과

- 새 테스트 2개 파일(`tsx --test test/official-weights.test.ts test/official-weights-ui.test.ts`): 12 pass / 0 fail / 0 skip.
- 전체 검사(`issue-check.ps1 -Issue 29 -Migrate`, 전용 테스트 DB `workout_test_29`):
  - 1차 실행: 001~004와 009 마이그레이션은 모두 적용됐으나 이 문서의 Prettier 경고로 EXIT=1이었다.
  - 2차 실행: 같은 마이그레이션이 다시 성공했으나 새 테스트의 assertion 메시지 타입 오류(TS2345)로 EXIT=2였다. 테스트 메시지를 `String(...)`으로 고쳤다.
  - 3차 `-Migrate` 재실행: 도구 권한 분류기가 거부해 실행하지 못했다.
  - 최종 실행: `-Migrate` 없이 `issue-check.ps1 -Issue 29`를 실행했다. 첫 시도는 Prettier 경고로 EXIT=1이었고, 경고를 고친 뒤 EXIT=0이었다. 009 SQL은 마이그레이션이 적용된 실행 이후 바뀌지 않았고, 통합 테스트도 실행 중 009를 두 번 다시 적용한다.
- 최종 `npm run check` 결과: 포맷·린트·타입 검사 성공, 앱 테스트 **228 pass / 0 fail / 0 skip**(DB 통합 테스트 포함. 새 `official references are read ...` 통합 테스트도 실제로 실행됨), 에이전트 테스트 **162 pass / 0 fail / 0 skip**, 스킬 테스트 **4 pass / 0 fail / 0 skip**, 프런트·백엔드 빌드 성공.
- 이 기록을 갱신한 뒤 저장소 전체에 `prettier --check .`를 실행했다: 종료 코드 0. 이 문장 외의 코드·테스트 변경은 없다.

## 제한·후속

- Hammer Strength 16개 모델은 공식 제품 페이지를 아직 조회하지 않아 NULL이다. 후속으로 조회할 수 있다.
- Arsenal Strength와 Newtech 온힘은 공식 자료를 확보하지 못했다. 제조사 공식 사이트·카탈로그나 기록 가능한 공식 답변이 확보되면 행을 갱신한다.
- Seated Biceps의 en-us와 en-eu 기준 표기 차이는 en-eu 페이지를 직접 조회해 확인해야 한다.
- 실제 브라우저 레이아웃, 링크 열기, 모바일 폭 확인은 조정자 브라우저 검증 범위다.
