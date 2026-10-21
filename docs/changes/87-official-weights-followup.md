# #87 공식 공무게가 없는 머신 값 조사·보완

- 이슈: [#87](https://github.com/sirloinbh/workout-memo/issues/87)
- 브랜치: `research/87-official-weights-followup`
  - `feat/86-weight-step` 위에서 시작했다. 마이그레이션 번호(010 → 011 → 012 → 013) 순서를 지키기 위해서다.
  - #91 → #92 → #94 → 이 PR 순서로 병합해야 한다.

## 결정 — 2026-10-21

- 조사 대상은 #29에서 `unverified`로 남긴 28행 전부다(Hammer Strength 16, Arsenal Strength 11, Newtech 온힘 1).
- 공식 출처가 없으면 비공식 측정값은 '참고(비공식)'으로 공식 값과 따로 표시한다.

## 조사

- 브랜드별로 하위 에이전트 2개가 웹 조사를 병렬로 했다. 주 에이전트는 결과 4건(Hammer Reverse V-Squat·Pullover, Arsenal Glute Bridge·ISO Conv Shoulder Press)을 제조사 페이지에서 다시 조회해 수치와 per arm 표기가 같은지 확인했다.
- 결과
  - Hammer Strength: 15행 공식 값 확인. Life Fitness 카탈로그 스펙표 기준이다.
  - Arsenal Strength: 11행 공식 값 확인. 공식 사이트는 `myarsenalstrength.com`이다. #29의 `arsenalstrength.com`은 무관한 체육관이었다.
  - 미확인 유지 2행
    - Assisted Nordic Ham: 공식 값이 시작 저항이 아니라 보조 하중(Starting Assistance 18 lb)이다.
    - Newtech 온힘: 핀(스택) 라인이고 공식 상세에 스택 최대 중량만 있다. 카탈로그 PDF는 직접 다운로드가 차단되어 확인하지 못했다.
- 비공식 값: 공식 값이 없는 2행에서는 판매처·커뮤니티의 구체적인 수치를 찾지 못했다. 그래서 비공식 값을 저장하는 필드와 표시는 만들지 않았다. 이 정책은 문서에 남겼다. 판매처 값이 공식 값과 일치한 3건은 비고에 적지 않았다(공식 값만 채택).
- 상세 표·판단 근거: [machine-official-weights-followup.md](../machine-official-weights-followup.md)

## 변경

- `database/migrations/013_official_weights_followup.sql`
  - 009가 미확인으로 둔 28행만 (브랜드·라인업·모델·설정) 키로 `UPDATE`한다.
  - 26행은 `verified` 값, 원문 단위, kg 환산, 기준, 출처로 바꾸고, 2행은 미확인 사유를 갱신한다.
  - 새 행 `INSERT`나 사용자 머신·세트 변경은 없다. 재실행해도 같은 결과다.
- `docs/machine-official-weights-followup.md` (신규), `docs/machine-official-weights.md`에 후속 조사 링크를 추가했다. 기존 표는 #29 결과로 유지한다.
- `backend/test/official-weights.integration.test.ts`
  - 009만 다시 실행하면 공유 테스트 DB의 013 결과가 되돌려진다. 그래서 재실행 검증이 009 → 013 순서로 실행하도록 바꿨다(실제 배포는 파일을 순서대로 한 번씩 적용한다).
  - 미확인 예시 행은 Arsenal 대신 아무 미확인 행이나 고른다.

## 테스트

- `backend/test/official-weights.test.ts`에 013 검사 3개를 추가했다(DB 없이 실행).
  - 009의 미확인 행만 한 번씩 다시 다룬다. `INSERT`나 머신·세트 쓰기가 없다.
  - `verified` 값
    - 출처는 제조사 도메인(lifefitness.com, myarsenalstrength.com)이고, 판매처 도메인은 금지한다.
    - lb → kg 환산이 정확하다.
    - per arm 기준은 공식 표기에 있을 때만 쓴다.
  - 미확인 행은 NULL과 사유를 가진다. Nordic Ham은 보조 하중이라 미확인이다.
  - 후속 문서 표가 마이그레이션 값과 같다.
- DB 통합(`official-weights.integration.test.ts`): 재실행 후에도 사용자 머신 기본중량과 세트 총중량이 그대로다. 테스트 DB 적용 후 상태별 개수는 verified 53, conflict 1, unverified 2였다.
- 화면 표시: 공식 참고값 표시 코드는 바꾸지 않았다. 기존 `frontend/src/official-weights.test.tsx`가 `verified`·미확인 표시를 계속 검증한다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB) 통과
  - 백엔드 296 pass, 0 skip(DB 통합 포함)
  - 프론트 99 pass
  - 워커 162, skills 4, docs 3, build 통과
- `npm run test:e2e`(같은 테스트 DB): 4 passed
- 처음 013을 적용한 직후의 통합 테스트는 3건 실패했다. 테스트가 009만 다시 실행해 갱신을 되돌렸기 때문이다. 재실행 순서를 고친 뒤 통과했다.

## 제한·후속

- Newtech 온힘 카탈로그 PDF는 직접 다운로드가 차단되었다. 사용자가 받은 카탈로그가 있으면 다시 확인할 수 있다.
- Abdominal / Oblique Crunch는 공식 값이 "25 lb + 사용자 체중의 10%"이다. 고정 부분만 값으로 두었다.
