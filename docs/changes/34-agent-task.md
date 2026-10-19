# #34 feat: 일지 초안 보존·저장 상태 표시·안전한 재시도

- 이슈: https://github.com/sirloinbh/workout-memo/issues/34
- 브랜치: feat/34-agent-task

## 변경 및 검증

### 테스트 단계 (2026-10-19)

- 기준: `c827abbe3a29d404ab42faa60a6a8f0c72ba9817`. 구현 파일은 변경하지 않았다. 이슈·브랜치는 코디네이터가 준비한 것을 재사용했고 커밋·원격 작업은 수행하지 않았다.
- `backend/test/workout-draft-ui.test.ts`: 기존 period UI 테스트의 React/VM 어댑터를 재사용했다. 새로고침 복구·폐기, 총중량/날짜 복구, 서버 통계와 초안 구분, 저장 중 중복 제출, 오프라인 및 타임아웃 오류 후 명시적 재시도, 내용 수정 시 키 교체, 응답 유실 후 새로고침과 키 유지, 성공 후 정리, 저장 공간 오류 및 손상된 초안의 시작 안전성을 검증한다.
- `backend/test/workout-retry.test.ts`: 실제 Express HTTP 요청과 제공된 전용 `TEST_DATABASE_URL`을 사용한다. 응답을 버린 뒤 재전송, 동시 중복 요청, 동일 키의 다른 내용 거부, 잘못된 키 거부, 오래된 버전 충돌, 수정 요청 재전송 시 세트/버전 보존을 검증한다. UUID 접두사로 만든 테스트 일지만 finally에서 정리한다. 연결 문자열은 출력하거나 기록하지 않았다.
- 제안한 API 계약은 UUID `Idempotency-Key` 헤더와 GET에서 반환하고 PUT 본문에 포함하는 정수 `version`이다. 구현자는 같은 동작을 보장하는 최종 계약으로 테스트 어댑터를 조정할 수 있다. 응답 재전송은 200 또는 201을 허용한다.

실제 실행 결과:

- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: 구현 전 예상 실패. 최종 실행 **0 pass / 16 fail / 0 skip / 0 cancelled**, exit 1. 16은 UI 9개, DB 하위 6개와 실패를 집계하는 상위 DB 테스트 1개다.
- DB에서 실제 확인한 실패: 응답 유실 재전송 시 2개 일지 생성, 동시 요청에 서로 다른 ID 반환, 내용 변경 키 재사용에 201(예상 409), 잘못된 키에 201(예상 400), 읽기 응답의 version 부재.
- UI에서 실제 확인한 실패: 로컬 초안 미보존, 폐기 선택 부재, 중복 제출 3회 전송, 저장 실패 후 초안 미보존, 내용 변경 요청에 재시도 키 부재, 저장 공간 오류 안내 부재.
- `npm run typecheck -w backend`: pass.
- `npx eslint backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts --max-warnings 0`: pass.
- `npx prettier --write backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: pass.
- `npm run check`: fail(exit 1). 포맷·전체 lint·frontend/backend 타입 검사 pass 후 `npm test`에서 **118 pass / 16 fail / 0 skip / 0 cancelled**. 실패는 모두 위 추가 테스트다. 명령의 `&&` 연결로 뒤의 `test:agents`와 build는 실행되지 않았다.
- 첫 작성 시 PowerShell 파이프로 전달한 한글이 손상되어 문법 검사가 실패했다. UTF-8 patch로 수정 후 위 결과를 다시 확인했다. 메시지 없는 assert의 실패 진단이 Node 22에서 정지해 해당 실행 2회는 중단했고 명시적 메시지를 추가한 최종 실행은 정상 종료했다.

한계 및 다음 단계:

- 실행 환경은 Node 22.17.0으로 프로젝트 지정 Node 24.21.0과 다르다. 최종 검증에서 지정 버전을 사용해야 한다.
- UI 어댑터는 DOM 배치·포커스·실제 React 스케줄링을 검사하지 않는다. 모바일/PC 브라우저 검증은 미실행이다. 타임아웃 테스트는 transport의 TimeoutError를 주입하며 실제 제한 시간과 AbortSignal 동작은 구현 후 추가 검증해야 한다.
- 보존 기간, 만료 키 처리 계약과 시간 제어 지점은 아직 없다. 구현 단계에서 기간/키 만료 경계 테스트와 사용자 안내(저장 위치·기간·기기 제한)를 추가해야 한다. 서버 중복 방지의 실제 DB 마이그레이션과 새 스키마 적용 후 통합 테스트도 재실행해야 한다.
- 새 기능이 없어서 발생한 red 테스트는 skip하거나 약화하지 않았다. 구현 후 깊은 후속 assertion까지 통과하는지 확인해야 한다.

### 구현 단계 (2026-10-19)

`workout-implementation`과 `workout-testing`을 적용했다. 이미 준비된 이슈·브랜치·worktree를 재사용했으며 커밋·푸시·PR·하위 에이전트 실행은 하지 않았다. 별도의 이전 리뷰 지적은 전달되지 않았다.

변경 내용:

- 입력 이벤트마다 하나의 로컬 초안을 동기적으로 저장한다. 새로고침 후 복구/폐기를 선택하며, 선택 전 새 기록 입력이나 다른 일지 수정을 막아 초안을 덮어쓰지 않는다. 편집 창을 닫아도 초안은 남는다. 복구는 서버에 자동 전송하지 않는다.
- 저장 위치는 이 기기·브라우저의 `localStorage`, 보존 기간은 마지막 입력부터 7일이며 다음 시작 시 만료 초안을 정리한다. 복구/재시도만으로 기간을 연장하지 않는다. 기기 간 동기화·브라우저 데이터 삭제·비공개 모드의 한계를 화면에 안내한다. 같은 브라우저의 탭들은 한 저장 위치를 공유한다.
- 저장 중·서버 저장 완료·실패·로컬 초안 상태를 표시한다. 오류 및 저장 상태를 편집 모달 안에도 표시하여 실제 편집 중에 확인할 수 있게 했다. 서버의 성공 응답 전에는 초안을 지우지 않는다. 저장 중에는 입력·닫기·중복 제출을 막으며, 동기 ref 잠금으로 React 재렌더 전의 연속 제출도 차단한다.
- 모든 API 요청에 15초 AbortController 제한 시간을 둔다. 실패 시 입력과 재시도 키를 유지하고 명시적인 재시도 버튼을 제공한다. 같은 본문·메서드·대상은 새로고침 후에도 같은 UUID 키를 사용하고, 내용 변경은 새 키를 사용한다. 응답 유실 후 내용을 바꾸면 별도 요청이라는 안내를 남긴다. 로컬 HTTP로 접속한 모바일에서 `randomUUID`가 없으면 `getRandomValues`로 UUID v4를 만든다.
- 저장 공간의 읽기·쓰기·삭제 오류와 손상된 JSON/구조를 처리한다. 로컬 저장 실패를 경고하면서 편집과 서버 저장을 허용한다. 저장 실패 경고는 디스크 보존이 성공했다고 단정하지 않는다.
- `003_workout_retries.sql`: 기존 일지에 `version=1`을 추가하고 키·SHA-256 지문·만료 시각·응답을 보관한다. 서버가 같은 키를 DB advisory transaction lock으로 직렬화한다. 일지·세트·재시도 결과를 함께 커밋하여 응답만 유실되어도 중복 생성하지 않는다.
- 키는 최초 성공 저장부터 7일간 유효하다. 같은 키로 정규화된 요청 내용·대상·메서드가 달라지거나 만료되면 409를 반환한다. 만료 키는 재사용으로 새 기록이 생기지 않도록 남긴다. 실패한 트랜잭션은 키를 소비하지 않는다. 기존 POST 클라이언트의 키 생략은 허용되지만 중복 방지는 키를 보낸 요청에 적용된다.
- PUT은 조회한 양의 정수 `version`을 요구한다. 잠근 DB 행의 버전과 다르면 세트 삭제 전에 409를 반환하며, 성공한 수정 재전송은 이전 응답을 반환해 버전을 다시 증가시키지 않는다. GET 및 저장 응답에 버전을 제공한다.
- `database/README.md`에 기존 볼륨의 마이그레이션 적용, 키 유효기간·보존, API 버전 계약, 초안의 한계를 추가했다. 초기화/CI는 기존대로 마이그레이션 파일을 순서대로 적용한다.

테스트 보강:

- 테스트 단계의 기존 assertion은 모두 유지했다. 이전 목표·머신·트랜잭션 테스트의 수정 요청은 현재 버전을 전달하도록 fixture만 보강했다. 기존 period UI 어댑터에는 브라우저 저장 공간·crypto·AbortController·timer를 제공했다.
- `workout-draft-ui.test.ts`: 기존 9개에 7일 보존 경계, 구조가 손상된 JSON, 실제 AbortSignal 취소와 15초 타이머 연결, 충돌 메시지/초안 유지, 로컬 HTTP의 UUID 대체 경로를 추가했다. 총 14개 UI 시나리오다. DOM 배치나 실제 브라우저 스케줄링을 대신하는 검사는 아니다.
- `workout-retry.test.ts`: 마이그레이션 재실행 시 기존 데이터·버전·키 보존과 DB 기준 7일 기본값, 키 만료, 필수 버전의 형식, 같은 키의 다른 요청 동시 실행, 두 기기의 같은 버전 동시 수정을 추가했다. 본래 응답 유실·동시 중복·충돌·수정 재전송 assertion도 모두 통과했다. 현재 테스트의 일지·키만 정리한다.

실제 명령과 결과:

- 전용 `TEST_DATABASE_URL` 존재 여부만 확인했다. 값은 출력하지 않았다. Node/pg로 `database/migrations/003_workout_retries.sql`을 읽어 해당 전용 DB의 `pool.query`로 적용했다: pass. 다른 DB나 `.env`는 사용하지 않았다.
- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: 최초 구현 후 **16 pass / 0 fail / 0 skip**. 이후 보존·취소·충돌 검증 보강 후 **22 pass / 0 fail / 0 skip**. 마지막 전체 검사에는 최종 추가 시나리오도 포함됐다.
- `npm test`: 중간 실행 **138 pass / 0 fail / 0 skip**. 첫 전체 검사에서는 기존 테스트가 버전을 전달하지 않아 실패했으며, 검증 내용을 바꾸지 않고 새 수정 계약을 전달하도록 수정했다. 마이그레이션 기간 테스트는 호스트와 DB의 시계 차이로 한 번 실패해 DB의 `now()`를 기준으로 정확히 604800초를 확인하도록 고쳤다.
- `node_modules/.bin/tsx --test backend/test/workout-draft-ui.test.ts backend/test/period-ui.test.ts`: UI 관련 **34 pass / 0 fail / 0 skip**(최종 UUID 테스트 추가 전 실행).
- `npx prettier --write`로 변경한 TS/TSX/CSS/Markdown을 포맷했다. SQL은 기본 Prettier 파서가 없어 별도 적용 대상에서 제외했다. 첫 `npm run check`의 포맷 경고는 수정했다.
- 최종 `npm run check`: **fail(exit 1)**. 포맷·전체 lint·frontend/backend 타입 검사 pass. `npm test`: **144 pass / 0 fail / 0 skip / 0 cancelled**, 전용 DB 통합 테스트 포함. `test:agents`: **86 pass / 0 fail / 0 skip / 0 cancelled**. 마지막 프런트엔드 빌드에서 Vite/esbuild가 상위 디렉터리 `../../../../../../../..`를 읽다 **Access is denied**로 실패했다. `vite.config.ts` 해석도 실패했으며 이어지는 백엔드 빌드는 `&&` 때문에 실행되지 않았다.
- `npm run build -w backend`: 별도로 실행해 pass.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/34 diff --check`: pass. Git의 사용자 전역 ignore 읽기 권한 경고는 있었으며 전역 설정은 변경하지 않았다.
- 브라우저 검증을 위해 ignored `.local/34-browser/serve.mts`에서 전용 테스트 DB를 사용하는 8088 개발 서버 실행을 시도했다: `node_modules/.bin/tsx .local/34-browser/serve.mts`. Vite 의존성 사전 빌드에서도 상위 디렉터리 읽기가 **Access is denied**로 실패해 서버가 종료됐다. Edge에서 모바일·PC 화면 확인이나 스크린샷을 생성하지 못했다. 권한 상승·샌드박스 우회는 하지 않았다.

차단 및 코디네이터의 남은 검증:

- **권한 차단**: Vite/esbuild의 상위 디렉터리 접근 거부로 전체 빌드와 모바일/PC 실제 화면 검증이 미완료다. 이 상태를 전체 검사 성공이나 브라우저 확인 완료로 보고하면 안 된다. 허용된 실행 환경에서 `npm run check` 및 390px 모바일/1440px PC의 초안 복구·저장 상태·실패/재시도 모달을 확인해야 한다.
- 현재 제공된 Node는 **22.17.0**이며 프로젝트 지정 **24.21.0**은 설치되어 있지 않다. 프로젝트 지정 Node/npm 환경에서도 검증해야 한다. 이 작업에서는 설치·전역 설정을 변경하지 않았다.
- 운영 DB에는 이 단계에서 적용하지 않았다. 배포 전 `003_workout_retries.sql` 적용이 필요하다. 구형 PUT 클라이언트는 새 필수 version 계약으로 갱신해야 한다.
- 기기 간 초안 동기화·여러 탭의 동시 초안 관리·백그라운드 자동 전송은 구현 범위가 아니다. 한 브라우저에서 한 탭으로 입력해야 한다. 키의 만료 표식은 안전한 과거 재전송 거부를 위해 누적 보관하며, 별도 정리 정책을 도입할 때 중복 방지 보장을 유지해야 한다.

## 코디네이터: 보호 테스트 정식 재인계 — 2026-10-19

워커는 구현 역할이 backend/test/workout-draft-ui.test.ts를 변경한 것을 감지해 중단했다. 기존 구현·테스트·로그를 보존하고 accept-requirements로 테스트 역할부터 정식 재검토한다. 이전 tests 인계 및 tests.log와 현재 diff를 비교하여 원래 assertion을 삭제/약화하지 않고 새 version·재시도 계약, 시간 기준과 UI 어댑터가 사용자 동작을 검증하는지 확인한다. 테스트 담당만 정식 해시를 생성한다. 해시 수동 교체나 테스트 skip으로 우회하지 않는다. 구현 역할은 재인계 이후 보호 테스트를 수정하지 않는다. Node 24.21.0은 프로젝트 루트 .local/node-v24.21.0-win-x64에 설치되어 있으며 전역 설정 변경 없이 기존 설치 실행기를 사용한다. 호스트 전체 검사와 실제 모바일/PC 브라우저 검증을 성공으로 가정하지 않는다.

### 보호 테스트 재인계: 테스트 담당 재검토 (2026-10-19)

- `AGENTS.md`, `workout-implementation`, `workout-testing`, 기존 작업 기록과 이전 `jobs/34/tests.log`의 테스트 작성·실행 내역을 읽었다. 원래 UI 9개 시나리오와 DB 6개 시나리오의 핵심 assertion(복구 값·서버 통계 분리·성공 전 보존·재전송 키·중복 방지·버전 충돌·세트 보존)은 유지됐다. 구현 단계의 추가 테스트는 실제 사용자 결과 및 DB 경계를 검증하며, 실패를 skip하거나 기대값을 약화한 변경은 발견하지 못했다.
- UI 어댑터의 `useRef`, AbortController, crypto 대체 경로와 제어 가능한 타이머는 현재 브라우저 API 계약을 제공하기 위한 변경이다. DB 시간의 7일 기본값은 호스트 시계 대신 동일 트랜잭션의 PostgreSQL `now()`를 기준으로 검증하는 것이 맞다. 기존 수정 fixture에 version을 추가한 변경도 새로운 서버 계약을 전달하며 기존 도메인 assertion을 유지한다.
- 이번 테스트 담당 보강: 동일 렌더의 submit 핸들러를 두 번 호출해 React 재렌더 전의 중복 클릭을 검증했다. 읽기는 가능하지만 쓰기 할당량이 초과된 경우, 서버 저장 후 로컬 삭제만 실패한 경우, 최신 서버 기록이 있어도 복구한 편집이 원래 version으로 요청하는 경우를 추가했다. DB에는 키의 메서드·대상 바인딩과 외래키 오류로 롤백된 요청의 키 재사용을 추가했다. 구현 파일은 수정하지 않았다.
- 테스트 추가 전 red 결과는 앞선 테스트 단계의 **0 pass / 16 fail / 0 skip** 기록을 유지한다. 이번에는 이미 구현된 작업 트리를 받았으므로 새 red 결과를 만들려고 구현을 되돌리거나 변경하지 않았다.
- 실행기: 프로젝트 루트의 기존 `.local/node-v24.21.0-win-x64`를 해당 명령 프로세스의 PATH 앞에 두었다. `node --version`: **v24.21.0**. 전역 설정이나 설치 파일은 변경하지 않았다. `TEST_DATABASE_URL`은 제공 여부만 확인했고 제공된 전용 DB만 사용했다.
- `node node_modules/prettier/bin/prettier.cjs --write backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: pass.
- `node node_modules/tsx/dist/cli.mjs --test backend/test/workout-draft-ui.test.ts backend/test/workout-retry.test.ts`: **31 pass / 0 fail / 0 skip / 0 cancelled**, exit 0. UI 17개, 마이그레이션 1개, API 하위 12개 및 상위 집계 1개다. 테스트 fixture만 정리하며 연결 문자열은 출력하지 않았다.
- 첫 `npm run check`: 문서 끝의 기존 포맷 경고로 format:check에서 fail(exit 1). 이후 단계는 실행되지 않았다. 문서를 포맷한 뒤 전체 검사를 다시 실행한다.
- 재실행 `npm run check` (Node 24.21.0): **fail(exit 1)**. 포맷·전체 lint·frontend/backend 타입 검사 pass. 앱/전용 DB 테스트 **149 pass / 0 fail / 0 skip / 0 cancelled**, 워커 테스트 **86 pass / 0 fail / 0 skip / 0 cancelled**. 프런트엔드 Vite/esbuild 빌드는 `Cannot read directory "../../../../../../../..": Access is denied` 및 `vite.config.ts` 해석 실패로 차단됐다. 이어지는 백엔드 빌드는 명령의 `&&` 때문에 실행되지 않았다. Node 버전 교체만으로 권한 오류가 해소되지 않았다.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/34 diff --check`: pass. 구현·Git 설정·작업 상태 메타데이터·보호 해시 기록은 변경하지 않았다. 아래 값은 테스트 담당이 최종 파일에서 계산한 인계용 SHA-256이며, 워커의 정식 상태 갱신은 코디네이터가 수행한다.
  - `backend/test/workout-draft-ui.test.ts`: `97b80901bbb99e65ca04246cb6732ff5d95debf64f5aec0891d3a2a40dd3b60b`
  - `backend/test/workout-retry.test.ts`: `1b7147de5d79acef0b9b1f02b7a8f73eb9ea6abb3e50580d4ab30c59453f235e`
- 남은 차단: 허용된 호스트 환경에서 전체 빌드 및 실제 모바일/PC 화면 검증이 필요하다. 이번 UI 테스트는 VM 이벤트/렌더 어댑터이며 DOM·레이아웃·실제 React 스케줄링 검증을 대체하지 않는다. 실제 화면 확인을 완료했다고 보고하지 않는다. 테스트/문서는 미커밋 상태로 남겼고 커밋·푸시·PR·승인·병합·하위 에이전트 실행은 수행하지 않았다.

## 코디네이터(Claude Code): 호스트 검증·독립 검토·실제 브라우저 확인 — 2026-10-19

- Codex 토큰 소진으로 중단된 작업을 Claude Code가 이어받았다. 테스트·구현 파일은 변경하지 않았다.
- 호스트(Node 24.21.0 / npm 11.19.0, 전용 테스트 DB)에서 `npm run check`: **exit 0**. 앱·DB **149 pass / 0 fail / 0 skip**, 워커 **86 pass / 0 fail / 0 skip**, 포맷·lint·타입·frontend/backend 빌드 통과. 샌드박스의 Vite/esbuild 접근 거부는 호스트에서 재현되지 않았다.
- 독립 검토(읽기 전용): 차단 지적 없음. advisory lock 기반 같은 키 직렬화, 요청 fingerprint, 버전 비교·`FOR UPDATE`, 만료 키 tombstone, 마이그레이션 멱등성을 확인했다. 참고(P3): `DELETE`는 version을 확인하지 않음, ROLLBACK 실패 시 원래 오류가 가려질 수 있음, 키 정리 없음 — 이슈 범위 밖으로 후속 판단.
- 실제 브라우저(Playwright, 전용 테스트 DB에 연결한 dev 서버):
  - 모바일 390×844: 입력 → 새로고침 → "초안 복구" 안내 → 복구 시 날짜·제목·운동명·62.5kg·8회 유지 → 저장 시 상태 "서버 저장 완료", localStorage 초안 삭제, 서버 조회에 기록 1건, 가로 스크롤 없음.
  - 같은 Idempotency-Key로 POST 2회: 두 응답 모두 201·같은 id, 기록 1건. version 1로 PUT 2회(다른 키): 첫 번째 200(version 2), 두 번째 409 충돌 안내.
  - PC 1440×900: 입력 모달 레이아웃·저장 상태 안내 정상.
  - 관찰: 모달을 연 직후 여러 필드를 연속 자동 입력한 첫 시도에서 복구 후 제목만 비어 있었다. 같은 절차를 다시 수행하면 제목이 저장·복구되어 재현되지 않았다. 자동화 타이밍 문제로 보이나 실제 사용자 입력 결함 여부는 PR 검토 시 확인을 권장한다.
