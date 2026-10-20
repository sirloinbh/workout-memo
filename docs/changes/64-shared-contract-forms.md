# #64 공유 Zod 계약과 React Hook Form 항목별 입력 검증

- 이슈: [#64](https://github.com/sirloinbh/workout-memo/issues/64) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 3단계 화면 기반, 2단계 공유 계약)
- 브랜치: `feat/64-shared-contract-forms`. #62(PR #63) 위에 쌓았다. 병합 순서는 #59 → #61 → #63 → 이 PR이다.

## 목적

- 입력 규칙(날짜, 총중량 0~99999 kg, 반복 수 1~1000, 글자 수)은 서버 Zod 스키마에만 있었다. 화면은 HTML 속성으로 일부만 막았다.
- 서버 오류는 "String must contain…" 같은 영어 기본 메시지로 한 줄에 표시되었다.

## 변경 — 2026-10-21

### 공유 계약

- 원본 `shared/contract.ts`를 만들었다.
  - 포함: 날짜, 일지·세트, 머신, 목표, 신체 기록 스키마와 `fieldErrors`(경로별 메시지).
  - 메시지는 한국어이고, 조사는 마지막 글자의 받침에 맞춘다(예: 운동명을, 반복 수는).
  - 목표 종료일 오류는 `deadline` 경로에 붙인다.
- `scripts/contract.mjs`와 npm 스크립트
  - `npm run contract:sync`: 원본을 `backend/src/contract.ts`, `frontend/src/contract.ts`에 복사한다.
  - `npm run contract:check`: `npm run check`에 포함된다. 복제본이 다르면 실패하며, CRLF 차이는 무시한다.
- workspace 패키지 대신 복제 방식을 쓴 이유: `frontend`·`backend` Docker 빌드 컨텍스트와 subtree 저장소가 각 디렉터리만으로 빌드되어야 한다. 이 방식은 기존 스킬 복제본(`skills/` → `.claude/skills/`)과도 같다.
- `backend/src/domain.ts`는 공유 스키마를 re-export한다. 기존 import 경로와 서버 검증 위치는 그대로다. 루틴·조회 범위·공식 참고값 질의 스키마는 domain.ts에 남겼다.
- 서버 400 응답은 이제 공유 스키마의 한국어 메시지를 반환한다. 영어 메시지에 의존하던 테스트는 없었다.

### 패키지

사용자가 공급망 위험을 인지했다고 명시 승인한 뒤 설치했다.

- frontend에 설치: zod 3.25.76(백엔드와 같은 버전), react-hook-form 7.89.0, @hookform/resolvers 5.9.1. 정확한 버전으로 고정했고 `--ignore-scripts`를 썼다.
- 새로 추가된 패키지는 2개(react-hook-form, @standard-schema/utils)이고, install 스크립트는 없다.
- subtree용 `frontend/package-lock.json`은 `--before=2026-10-06`으로 다시 만들었다.

### 화면

- **목표 폼**: `GoalForm` 컴포넌트로 분리하고 React Hook Form + `zodResolver(goalSchema)`로 바꿨다.
  - `noValidate`를 써서 브라우저 기본 메시지 대신 계약 메시지를 보여준다.
  - 숫자는 `valueAsNumber`로 받는다. 빈 값은 "숫자로 입력하세요" 오류가 된다.
- **일지 폼**: 초안·재시도·세트 완료 상태가 기존 상태와 localStorage 초안에 묶여 있어 RHF로 옮기지 않았다. 대신 저장 직전에 `workoutSchema.safeParse`로 검사한다.
  - 실패하면 요청을 보내지 않는다. 상태를 "입력을 확인하세요 · 서버로 보내지 않았습니다"로 표시하고, 날짜·제목·세트 수·세트별 운동명/총중량/반복 수/RPE 오류를 보여준다.
  - 서버로 보내는 본문과 재시도 지문(fingerprint)은 기존과 같다.
- **머신 폼**: 저장 직전에 `machineSchema.safeParse`로 검사하고 브랜드·이름·기본중량 오류를 표시한다.
- **접근성**: 오류 문구는 `label` 밖의 `.field-error`에 둔다. 입력란에는 `aria-invalid="true"`와 `aria-describedby`를 연결한다. 문구가 label 밖에 있으므로 입력란의 접근성 이름은 바뀌지 않는다.
- 모달을 닫으면 남은 오류를 지운다.

## 테스트

새 테스트:

- `frontend/src/forms.test.tsx` (3개)
  - 목표: 빈 값 제출 시 운동명·총중량 오류, 종료일이 시작일보다 앞서면 종료일 오류, 요청은 0건이다. 올바르게 고치면 숫자 타입 본문으로 POST 1건이 전송된다.
  - 일지: 총중량 100000과 두 번째 세트 운동명 누락이 각 입력란에 연결된다. 정상 필드에는 표시되지 않고 요청은 0건이다. 수정 후 3세트로 저장된다.
  - 머신: 브랜드와 이름이 없으면 등록 요청 없이 오류를 보여준다.
- `backend/test/contract.test.ts` (3개)
  - 세트 경로별 한국어 메시지와 조사, 빈 세트 배열 오류
  - 목표 종료일 오류가 `deadline` 경로에 붙는지
  - API 400 응답이 같은 메시지를 반환하는지(저장소에 도달하지 않음)
- `scripts/test/contract.test.mjs` (2개): 저장소 복제본이 원본과 일치하는지, 바뀌거나 없는 복제본을 찾고 CRLF 차이는 무시하는지

기존 테스트 수정:

- `frontend/src/set-completion.test.tsx`의 `openNew`가 기본 3세트 모두에 운동명을 채우도록 바꿨다. 기존 테스트는 2·3번째 세트를 빈 운동명으로 저장했다. 실제 서버라면 400으로 거부하는 입력을 목업 서버만 받아준 것이다. 검증 대상(세트 완료 상태 전송)은 바꾸지 않았다.

실행 결과(Node 24.21.0, 전용 테스트 DB, 로컬 Chrome):

| 검사                                    | 결과                           |
| --------------------------------------- | ------------------------------ |
| `npm run check` (`contract:check` 포함) | **EXIT=0**                     |
| 백엔드 node:test (DB 포함)              | **275 pass / 0 fail / 0 skip** |
| 프론트 Vitest                           | **85 pass / 0 fail**           |
| 계약 동기화 테스트                      | 2 pass                         |
| `npm run test:e2e`                      | **2 passed**                   |
| `docker build ./frontend`, `./backend`  | 모두 성공                      |

## 제한·후속

- 일지·머신 폼은 RHF로 옮기지 않았다. 초안 저장·재시도 키·세트 완료 연타 방지가 기존 상태 로직에 묶여 있어서다. 이 동작을 RHF로 옮기려면 별도 이슈에서 초안 저장 구조부터 나눠야 한다.
- 루틴·신체 기록 폼은 기존 서버 검증을 그대로 쓴다. 신체 기록 스키마는 계약에 포함했으므로 화면 적용은 후속 작업이다.
- OpenAPI 문서 생성은 2단계 잔여 작업으로 별도 진행한다.
