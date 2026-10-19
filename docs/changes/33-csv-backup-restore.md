# #33 feat: CSV 내보내기와 버전 있는 백업·복원

- 이슈: https://github.com/sirloinbh/workout-memo/issues/33
- 브랜치: feat/33-csv-backup-restore (코디네이터가 준비한 worktree 재사용, 이슈·브랜치 신규 생성 없음)

## 목적

운동 기록을 스프레드시트 분석용 CSV로 내려받고, 앱 자체 형식의 버전 있는 JSON 백업으로 관계를 보존해 안전하게 복원한다. 분석용 CSV와 복원용 백업을 명확히 분리한다. 다른 앱 CSV 가져오기와 예약 클라우드 백업은 제외했다.

## 변경 내용

- `backend/src/backup.ts`(신규): CSV 인코더(외부 의존성 없음), 백업 v1 스키마(Zod)·참조 검증, 내보내기·미리보기·복원 라우트.
  - `GET /api/export/workouts.csv[?from&to]`: UTF-8 BOM, RFC 4180, CRLF, 세트 1행. 수식 시작 문자(`=`, `+`, `-`, `@`, 탭, CR) 글자 값 앞에 `'`. NULL은 빈 칸.
  - `GET /api/backup`: `{ format: "workout-memo-backup", version: 1, exported_at, data: { brands, machines, workouts(sets 중첩), goals, routines } }`. 한 REPEATABLE READ READ ONLY 스냅샷에서 읽는다.
  - `POST /api/backup/preview` / `POST /api/backup/restore`: 본문 `{ mode: merge|replace, backup, confirm? }`. 같은 절차를 한 트랜잭션에서 실행하고 preview는 ROLLBACK, restore는 COMMIT한다. 중간 오류는 전체 ROLLBACK 후 500 `복원 중 오류가 발생해 전체 취소했습니다…`.
- `backend/src/app.ts`: 백업 라우트를 앱 전역 256kb JSON 파서보다 먼저 등록해 백업만 10MB(+64KB)까지 허용. 413 오류 메시지 추가.
- `frontend/src/backup.tsx`(신규), `main.tsx`: `백업·내보내기` 메뉴. CSV·JSON 다운로드 링크, 정책 안내, 파일 선택 → 크기(10MB)·JSON 파싱 확인 → 서버 미리보기 요약(추가·건너뜀·충돌·삭제) → `복원 실행`. 전체 교체는 확인 문구 `전체 교체` 입력 전까지 버튼 비활성. 방식 변경 시 미리보기 재계산, 완료 후 대시보드 데이터 새로고침. `style.css`에 간단한 간격 스타일.
- `database/README.md`, `README.md`: CSV 열·날짜·kg·NULL·머신 연결·수식 방지, 백업 JSON 구조, 복원 정책, `workout_requests` 제외 이유, SQL 백업과 역할 구분.
- 마이그레이션 없음(`010_backup.sql` 불필요).

## 정책

- 기본 `merge`(추가만): 기존 행 수정·삭제 없음. 브랜드는 이름, 머신은 브랜드+이름으로 연결. 머신 기본중량·메모가 다르면 기존 값을 유지하고 충돌로 보고하며 복원 세트는 기존 머신에 연결. 일지(세트 내용·순서 포함)·목표·루틴은 동일 내용이면 건너뜀. 동일 기존 행 1개가 들어오는 행 1개만 흡수하는 다중집합 비교라 반복 복원은 아무것도 늘리지 않고, 원래 동일한 2개 일지는 2개로 복원된다.
- `replace`(전체 교체): 브랜드·머신·일지·세트·목표·루틴 삭제 후 백업으로 채움. `confirm === "전체 교체"`가 아니면 400, 삭제 없음. 미리보기는 확인 문구 없이 삭제 수를 보여 준다.
- 검증 순서: 형식 → 버전(v1만) → 스키마(기존 도메인 제약과 같은 범위·루틴 규칙) → 참조(브랜드·머신 존재, id 중복, 브랜드 이름·브랜드별 머신 이름 중복). 실패 시 400, 경로가 포함된 메시지 최대 5개.
- `workout_requests` 제외: 7일 재시도 키·응답 id가 원본 DB에서만 의미가 있는 일시적 중복 방지 기록이다. (검토 후 수정) 전체 교체에서는 같은 트랜잭션에서 비운다. 아래 후속 수정 참고.

## 판단 사항

- 복원 시 id는 보존하지 않고 새로 발급한다(관계만 보존). 복원 일지는 `version=1`, `created_at`은 보존한다. (검토 후 철회) 전체 교체 후 재시도 키를 남기는 판단은 삭제된 id 재전송 문제로 철회했다.
- 백업 스키마는 일지의 세트 0개를 허용한다(API는 1개 이상 요구). 수동 SQL로 생긴 데이터도 내보낸 뒤 복원할 수 있게 하려는 보수적 선택이다.
- 머신 충돌 시 덮어쓰지 않고 기존 값을 유지한다(사용자 확인 없이 기존 기록을 바꾸지 않는 원칙).
- CSV 헤더는 분석 도구 호환을 위해 영문 snake_case, UI·문서는 한국어로 설명한다. 수식 방지 `'`는 글자 열에만 적용하고 숫자 열(항상 0 이상)은 그대로 둔다.
- 개수 상한: 브랜드 1000, 머신 5000, 일지 20000(일지당 세트 200), 목표 5000, 루틴 1000.

## 테스트

- `backend/test/backup.test.ts`(단위 6): 쉼표·따옴표·LF/CR·한글 왕복, 수식 시작 문자 7종 무력화와 일반 텍스트·숫자 비변경, NULL 빈 칸, v1 정상 백업, 다른 형식·문자열 버전·v2 거부, 참조 오류·중복 id·중복 이름·잘못된 날짜·반복 수·목표 기간·루틴 규칙·누락 테이블 거부.
- `backend/test/csv-reader.ts`: 테스트용 최소 RFC 4180 리더(BOM 확인).
- `backend/test/backup.integration.test.ts`(DB 8): 전용 테스트 DB 안에 테스트마다 별도 schema를 만들어 마이그레이션을 적용하고 finally에서 DROP(전체 교체가 동시 실행되는 다른 테스트 데이터를 지우지 않도록). 내보내기→빈 DB 복원 동등성(자연 키 비교), 미리보기 무변경·미리보기=실행 요약, 반복 복원·자기 자신 복원 무변경, 동일 일지 2개 보존, 두 DB CSV 동일; 머신 충돌 기존 유지·연결; 전체 교체 확인 문구 4종 거부·미리보기 삭제 수·정확한 미러링; 손상 JSON·다른 형식·미지원 버전·data 누락·머신/브랜드 참조 오류·중복 id(preview/restore 모두 400)·10MB 초과 413·잘못된 mode 400, 모두 무변경; merge/replace 각각 goals INSERT 단계 강제 실패 시 500·전체 무변경(삭제 포함 ROLLBACK); CSV 헤더·BOM·escape·수식 방지·NULL·기간 필터·잘못된 기간 400; 재시도 키 미포함, 전체 교체 후 재시도가 삭제된 id를 재전송하지 않음(후속 수정).
- `backend/test/backup-ui.test.ts`(UI 4, 기존 vm 어댑터 방식): CSV/JSON 링크 분리와 정책 문구, 파일 선택 시 merge 미리보기만 요청·요약 표시·실행 후 재전송 불가, 전체 교체 방식 재미리보기·삭제 경고·확인 문구 전까지 비활성·confirm 전송, 손상/10MB 초과 파일과 서버 거부 시 restore 미요청.
- `backend/test/workout-draft-ui.test.ts`: 새 `./backup` import 스텁 1줄 추가(기존 `./routines` 스텁과 같은 방식). assertion 변경 없음.
- 구현 전 실행: `tsx --test test/backup.test.ts test/backup-ui.test.ts` → **0 pass / 5 fail**(모듈·메뉴 부재로 예상 실패).

### 실제 명령과 결과 (2026-10-19, Node 24.21.0)

- `issue-check.ps1 -Issue 33 -Migrate`(전용 DB `workout_test_33`에 001~004 적용 후 `npm run check`, 연결 문자열 미출력): **EXIT=0**.
  - format:check pass, lint pass, typecheck(frontend/backend) pass.
  - `npm test`: **227 pass / 0 fail / 0 skip / 0 cancelled**(DB 통합 포함, 신규 백업 테스트 18개 포함).
  - `test:agents`: **162 pass / 0 fail / 0 skip**. `test:skills`: **4 pass / 0 fail**.
  - build: frontend(vite) pass, backend(tsc) pass.
- 중간 실패와 수정: 첫 실행에서 기존 `workout-draft-ui` 어댑터가 새 `./backup` import를 거부(스텁 추가), 신규 테스트의 파일명 따옴표 기대·`response.text()`의 BOM 제거·수식 픽스처 위치 오류를 테스트 쪽에서 수정. lint의 `any` 사용을 타입으로 교체.

## 제한·후속

- 실제 브라우저(파일 선택 대화상자, 다운로드, 모바일/PC 레이아웃)는 미검증이다. 코디네이터 브라우저 확인 필요.
- 복원은 행 단위 INSERT라 상한 근처의 대용량 백업은 느릴 수 있다. 진행률 표시는 없다.
- 미리보기와 실행 사이에 데이터가 바뀌면 실행 결과 요약이 미리보기와 다를 수 있다(실행 결과를 다시 표시).
- 인증이 없는 개인용 API이므로 백업 다운로드도 같은 네트워크 접근 범위를 따른다.

## 후속 수정: 전체 교체 시 재시도 키 초기화 (2026-10-19)

독립 검토 P2: 전체 교체가 삭제한 일지의 `workout_requests` 키가 남아, 응답을 잃은 POST를 같은 키로 재시도하면 삭제된 id의 201 응답이 재전송되어 저장된 것으로 오인될 수 있었다(오래된 version의 PUT 재전송도 같음).

- `backend/src/backup.ts`: replace 모드에서 데이터 테이블 잠금 뒤 `workout_requests`도 `EXCLUSIVE`로 잠그고 같은 트랜잭션에서 `DELETE FROM workout_requests`. 요약에 `retry_keys_cleared` 추가(미리보기는 ROLLBACK이라 실제 삭제 없음). merge 모드는 키를 건드리지 않는다.
- UI: 전체 교체 정책 문구와 미리보기 경고에 "진행 중이던 저장 재시도 기록도 초기화됩니다(N건)" 표시.
- `database/README.md`: 정책 갱신. 새 `Get-Content | psql` 파이프 명령은 추가하지 않았다(기존 줄은 main에 있던 것으로 이번 범위에서 변경하지 않음).
- 테스트: 기존 "전체 교체 후 키 보존" assertion을 새 정책에 맞게 대체. 회귀 테스트 `a retried save after a replace restore never claims a deleted workout id`: 키 K로 POST → merge 복원 후 재전송은 같은 id(키 유지) → replace 미리보기는 키 유지 → replace 복원 → K 재시도 응답 id가 삭제된 id가 아니고 실제 저장된 일지를 가리킴, `retry_keys_cleared=1`. UI 테스트에 경고 문구 assertion 추가.

실제 결과:

- 수정 전 `issue-check.ps1 -Issue 33 -Migrate -Script test`: **227 pass / 1 fail**, 실패 `Must not replay the deleted id`, EXIT=1.
- 수정 후 `issue-check.ps1 -Issue 33 -Migrate`(전체 `npm run check`): **EXIT=0**. format·lint·typecheck pass, `npm test` **228 pass / 0 fail / 0 skip**, `test:agents` **162 pass**, `test:skills` **4 pass**, build pass.

## 코디네이터 검토·실제 브라우저 확인 — 2026-10-19

- 독립 고위험 검토(읽기 전용): P0/P1 없음. **P2 1건**: 전체 교체 복원 뒤에도 `workout_requests` 재시도 키가 남아, 응답을 잃은 저장을 같은 키로 다시 보내면 삭제된 일지 id를 "저장됨"으로 돌려줄 수 있었다. 위 `fix: clear stale retry keys on replace restore`로 수정했다(회귀 테스트는 수정 전 실패). 그 밖에 확인 문구 없이 교체 불가, 미리보기 롤백, 단일 클라이언트 트랜잭션, 참조 검증·id 재매핑, 10MB 본문 한도, CSV 이스케이프, 파라미터 쿼리를 확인했다.
- 실제 브라우저(Playwright, 전용 DB `workout_test_33`의 dev 서버):
  - 제목 `백업 "검증", 쉼표`, 메모 `줄1\n줄2`, 운동명 `=SUM(1,2)`, 세트 메모 `-메모`로 저장 → CSV: UTF-8 BOM(EF BB BF), `text/csv; charset=utf-8`, 따옴표 두 번 쓰기·쉼표·줄바꿈 셀 인용, `'=SUM(1,2)`·`'-메모`로 수식 실행 방지.
  - 백업 v1 내려받기 → 화면에서 파일 선택: "미리보기 · 추가만 (아직 변경되지 않았습니다)", 동일 항목 건너뜀 표시.
  - 전체 교체 선택: 삭제 수와 "진행 중이던 저장 재시도 기록도 초기화됩니다(1건)" 경고, 확인 문구 미입력·`전체교체`(띄어쓰기 없음)에서는 실행 버튼 비활성, 미리보기 후에도 서버 기록 유지. 정확히 `전체 교체` 입력 후 실행 → 기록이 같은 내용(따옴표·줄바꿈·특수문자 포함)으로 복원됐다.
  - API: 확인 문구 없는 교체 400, 미지원 버전(v99) 400.
  - 모바일 390px 가로 스크롤 없음.
