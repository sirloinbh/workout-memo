# #18 feat: [MVP] 점진적 과부하 목표 설정과 달성 판정

- 이슈: https://github.com/sirloinbh/workout-memo/issues/18
- 브랜치: feat/18-agent-task

## 변경 및 검증

### 테스트 단계 (2026-10-15)

- 기준 SHA: `a0ce3245dddf8974f36054d01967ff21efbb5f29`.
- `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`를 읽고 기존 이슈와 브랜치를 재사용했다. 테스트 역할 범위에 따라 구현, 커밋, 원격 작업은 수행하지 않았다.
- 추가 파일: `backend/test/goals.test.ts`. 기존 Node test/tsx 및 HTTP API를 사용하며 새 의존성을 추가하지 않았다.
- DB 없이 실행하는 API 테스트는 빈 운동명, 음수·상한 초과·문자열 중량, 0·소수·상한 초과 반복 수, 불가능한 날짜, 역전된 기간, 잘못된 날짜 형식을 거부하고 저장을 시도하지 않는지 검증한다.
- 전용 DB 통합 테스트는 목표 생성·조회 시 모든 설정값 보존, 최초 미달 상태, 시작일·종료일 포함, 기간 밖 제외, 목표값과 같은 값·초과값·미달값, 서로 다른 세트의 분리 충족 제외, 다른 운동명 제외, 앞뒤 공백·영문 대소문자 무시를 검증한다. 일지 날짜 및 세트 수정, 충족 세트 제거·재추가, 일지 삭제 후 재판정과 같은 날 시작·종료하는 목표도 포함한다.
- 별도 시간대 통합 테스트는 PostgreSQL 세션을 `Etc/GMT+12`, `Etc/GMT-14`로 각각 실행한다. Asia/Seoul의 오늘 기록은 포함하고 내일 기록은 제외해야 한다. 테스트 날짜는 DB의 현재 시각을 Asia/Seoul로 명시 변환해 구한다. 두 시간대를 사용하여 실행 시간에 관계없이 DB 세션 날짜와 한국 날짜가 다른 경우를 포함한다. 무작위 운동명으로 데이터를 분리하고 생성한 목표·일지를 정리한다.

#### 실제 실행 결과

- `npm test`: exit 0, 총 17개, pass 14, fail 0, skip 3. 새 입력 검증 하위 사례 10개가 통과했다. 기존 DB 통합 테스트 1개와 새 DB 통합 테스트 2개는 모두 `TEST_DATABASE_URL` 미제공으로 skip되었다. DB 검증 완료를 의미하지 않는다.
- `npm run typecheck -w backend`: exit 0.
- `npx eslint backend/test/goals.test.ts --max-warnings 0`: exit 0.
- `npx prettier --write backend/test/goals.test.ts`: exit 0, 새 테스트 파일만 포맷했다.
- `npx prettier --check backend/test/goals.test.ts`: exit 0.
- `node -e "console.log('TEST_DATABASE_URL provided:', Boolean(process.env.TEST_DATABASE_URL))"`: `false`. 환경변수의 존재 여부만 확인했으며 연결 문자열이나 다른 비밀 파일은 읽지 않았다.

#### 구현 전 예상 실패와 차단 사항

- 코드 검토에서 `backend/src/app.ts`의 목표 조회가 `LEAST(g.deadline,CURRENT_DATE)`를 사용하는 것을 확인했다. `CURRENT_DATE`는 PostgreSQL 세션 시간대에 의존하므로 Asia/Seoul 기준과 다른 날짜일 때 오늘 기록을 제외하거나 내일 기록을 포함할 것으로 예상한다. 새 두 시간대 통합 테스트가 이 차이를 잡도록 작성했다. **전용 DB가 없어 실제 실패는 관찰하지 못했으며 예상 실패와 실행 결과를 구분한다.**
- 필요한 입력인 전용 `TEST_DATABASE_URL`이 제공되지 않아 DB의 실제 목표 저장·판정·수정·삭제 및 시간대 회귀 검증은 차단되었다. 구현 담당자는 전용 스키마가 준비된 테스트 DB에서 `npm test`를 실행해 구현 전 실패와 수정 후 성공을 확인해야 한다.
- `npm run check`는 테스트 단계에서 실행하지 않았다. 관련 백엔드 테스트·타입·lint·포맷 검사만 실행했으며 전체 검사는 최종 구현 후 수행해야 한다.
- UI에서 목표 설정 후 기록 추가·수정·삭제하는 브라우저 흐름은 실행하지 않았다. 이번 변경은 서버 API 테스트만 추가했으며 UI 검증은 구현·최종 검증 단계에 남아 있다.

### 테스트 단계 재실행 (2026-10-15, 전용 DB 제공 후)

- 기존 미커밋 테스트와 위 기록을 보존하고 검토했다. 이번 실행에는 전용 `TEST_DATABASE_URL`이 제공되었다. 위의 DB 미제공 차단은 해소되었으며 연결 문자열은 출력하지 않았다.
- `backend/test/goals.test.ts`에 120자 초과 운동명, null 운동명, 문자열 반복 수, null 시작일, 불가능한 종료일 거부 사례를 추가했다. 구현 파일은 변경하지 않았다.
- 변경 전 `npm test`: exit 1, 총 35개, pass 32, fail 3, skip 0. 실제 DB 통합 테스트를 실행하여 예상했던 한국 날짜 기준 판정 실패를 재현했다.
- 보강 후 `npm test`: exit 1, 총 40개, pass 37, fail 3, skip 0. 실패 3개는 하나의 실제 assertion 실패 및 상위 두 테스트의 실패 집계다. `Etc/GMT+12` 세션의 `today is included`에서 기대 `true`, 실제 `false`였다. `CURRENT_DATE`가 한국의 오늘보다 이전 날짜인 세션에서 오늘 기록을 제외한다. `Etc/GMT-14` 세션의 오늘 포함·내일 제외는 이번 실행에서 통과했다.
- 입력 검증 15개, 목표 설정값 저장·조회, 기간 양끝 경계, 기간 밖 제외, 동일·초과·미달 수치, 서로 다른 세트의 분리 충족 제외, 운동명 공백·대소문자와 다른 이름 비교, 일지·세트 수정 및 삭제 후 재판정, 같은 날 시작·종료 목표가 통과했다. 기존 PostgreSQL CRUD 통합 테스트도 통과했다.
- `npm run typecheck -w backend`: exit 0 (보강 전·후).
- `npx eslint backend/test/goals.test.ts --max-warnings 0`: exit 0 (보강 전).
- `node node_modules/eslint/bin/eslint.js backend/test/goals.test.ts --max-warnings 0`: exit 0 (보강 후).
- `npx prettier --check backend/test/goals.test.ts`: exit 0 (보강 전).
- `node node_modules/prettier/bin/prettier.cjs --check backend/test/goals.test.ts`: exit 0 (보강 후).
- `node -e "console.log('TEST_DATABASE_URL provided:', Boolean(process.env.TEST_DATABASE_URL))"`: `true`.
- 테스트 단계는 차단되지 않았다. 구현 담당자는 목표 조회 날짜 상한을 Asia/Seoul 기준으로 수정한 후 테스트를 다시 실행해야 한다. 전체 `npm run check`와 브라우저 흐름 검증은 구현 및 최종 검증 단계에 남겨 둔다. 커밋·푸시·PR·추가 에이전트 실행은 수행하지 않았다.

### 구현 단계 (2026-10-15)

- 기존 이슈·브랜치·미커밋 테스트를 재사용하고 `workout-implementation`, `workout-testing`을 적용했다. 구현 역할 범위에 따라 커밋·푸시·PR·승인·병합·추가 에이전트 실행은 수행하지 않았다. 별도 이전 검토자 지적은 전달되지 않았으며 테스트 단계에서 재현한 날짜 판정 실패를 수정했다.
- `backend/src/app.ts`: 목표 조회의 날짜 상한을 세션 시간대에 의존하는 `CURRENT_DATE`에서 `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date`로 변경했다. 서버가 한국의 오늘까지 기록을 포함하고 미래 기록을 제외한다. 목표 기간 양끝 포함, 운동명 trim/lower 비교, 한 세트에서 중량·반복 수 동시 충족 및 조회 시 재판정 로직은 기존 구현을 재사용한다.
- `backend/test/goals.test.ts`의 테스트·assertion은 모두 보존했다. 테스트 단계에서 추가한 HTTP API·DB 회귀 테스트가 수정 전 실패와 수정 후 성공을 검증한다.
- 기존 UI를 읽어 목표 설정 폼·상태 표시와 일지 저장·수정·삭제 후 `action` → `refresh` → `/api/goals` 재조회 흐름을 확인했다. 화면 변경은 없다.

#### 실제 실행 결과

- 수정 전 `npm test`: exit 1, 총 40개, pass 37, fail 3, skip 0. `Etc/GMT+12`의 한국 오늘 기록 포함 assertion이 실제 실패했고 상위 테스트 2개가 실패로 집계되었다.
- 수정 후 `npm run check`: exit 0. 포맷·ESLint·양쪽 workspace 타입 검사·백엔드 테스트·에이전트 테스트·프런트엔드 및 백엔드 빌드가 모두 통과했다.
- 위 전체 검사에 포함된 전용 `TEST_DATABASE_URL` DB 실행: 백엔드 총 40개, pass 40, fail 0, skip 0. 두 세션 시간대에서 한국 오늘 포함·내일 제외가 모두 통과했다. 목표 설정값 저장·조회, 입력 오류, 기간·수치 경계, 운동명 비교, 세트 조건 분리 제외, 일지·세트 수정 및 일지 삭제 후 재판정도 통과했다.
- 위 전체 검사에 포함된 `npm run test:agents`: 총 34개, pass 34, fail 0, skip 0.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/18 diff --check`: exit 0.
- 구현 기록 추가 후 `node node_modules/prettier/bin/prettier.cjs --check docs/changes/18-agent-task.md`: exit 0.
- 전용 테스트 DB 환경변수는 존재 여부만 확인하고 기존 테스트를 통해 사용했다. 연결 문자열·인증 정보·`.env`·백업·Terraform state는 읽거나 출력하지 않았다.

#### 검증 한계 및 인계

- 브라우저 도구가 제공되지 않아 실제 UI에서 목표 설정 후 기록 추가·수정·삭제하는 조작 검증과 화면 증거 수집은 수행하지 않았다. 위 UI 확인은 코드 검토이며 API·DB 테스트 결과와 구분한다. 최종 검토 시 브라우저 흐름 확인이 남아 있다.
- 구현과 자동 검증에 차단은 없다. 변경 파일과 테스트는 미커밋 상태로 코디네이터의 독립 검토에 넘긴다.
