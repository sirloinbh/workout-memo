# #21 chore: 저장소 공개 전환과 CI·AWS 월 비용 산정

- 이슈: https://github.com/sirloinbh/workout-memo/issues/21
- 브랜치: feat/21-agent-task

## 변경 및 검증

작업 에이전트가 실제 변경·검증 결과를 기록한다.

## 테스트 단계 (2026-10-15, Asia/Seoul)

목적은 앱 8개의 공유 서버·DB 비용 문서에 필요한 사전 검증과 구현 전 미충족 항목 확인이다. AGENTS.md, workout-implementation, workout-testing을 읽었다. 기존 이슈와 브랜치를 재사용하며 테스트 역할은 이 작업 기록만 변경했다. 앱 테스트·도구·스킬·구현 파일은 추가하거나 변경하지 않았다.

### 실제 명령과 결과

- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short --branch`: 현재 `feat/21-agent-task`, 기존 미추적 작업 기록만 확인. 사용자 Git ignore 설정의 읽기 권한 경고가 있었으나 작업 트리 상태 조회는 성공했다. 전역 Git 설정은 변경하지 않았다.
- 다음 산출물 검사는 종료 코드 1로 예상대로 실패했다. 비용 문서가 없고 README 상대 링크도 없다. 구현 전 요구사항 미충족이며 실행 환경 차단은 아니다.

```powershell
node -e "const fs=require('fs');const p='docs/shared-hosting-costs.md';const exists=fs.existsSync(p);const link=fs.readFileSync('README.md','utf8').includes('](docs/shared-hosting-costs.md)');console.log('cost document exists: '+exists);console.log('README relative link exists: '+link);process.exitCode=exists&&link?0:1;"
```

- 다음 계산 검사는 종료 코드 0으로 통과했다. ECR $0.50, 스냅샷 $1.00, 월 세전 $13.50/$25.50, 설명용 환율의 세전 18,900원/35,700원 및 VAT 가정 세후 20,790원/39,270원을 확인했다.

```powershell
node -e "const assert=require('node:assert/strict');const ecr=5*0.10,snapshot=20*0.05;assert.equal(ecr,0.50);assert.equal(snapshot,1);for(const [server,usd,krw,vat] of [[12,13.5,18900,20790],[24,25.5,35700,39270]]) {assert.equal(server+ecr+snapshot,usd);assert.equal(usd*1400,krw);assert.equal(Math.round(krw*1.1),vat);}console.log('PASS: ECR, snapshot, USD totals, illustrative KRW and VAT totals (2 GB / 4 GB)');"
```

- `npm run check`: 종료 코드 0. Prettier, ESLint, 프런트엔드·백엔드 타입 검사, 백엔드 단위 테스트 3개, 에이전트 테스트 34개, 프런트엔드·백엔드 빌드 통과. PostgreSQL 통합 테스트 1개는 건너뜀이며 DB 검증 완료가 아니다. 전용 DB 설정은 추가하지 않았다. 이는 구현 전 기준 결과이며 최종 문서 검증을 대신하지 않는다.
- 웹 도구 `open`으로 아래 공식 출처 4개 접근 성공. Lightsail IPv4 Linux 기본 요금 $5/$7/$12/$24, 스냅샷 $0.05/GB-month 및 ECR 요금 예시의 $0.10/GB-month를 확인했다. RDS 구성별 확정 견적·실시간 환율은 조사하지 않았다.
  - [Lightsail 요금](https://aws.amazon.com/lightsail/pricing/)
  - [ECR 요금](https://aws.amazon.com/ecr/pricing/)
  - [RDS PostgreSQL 요금](https://aws.amazon.com/rds/postgresql/pricing/)
  - [Amplify 요금](https://aws.amazon.com/amplify/pricing/)
- `npx --no-install prettier --check docs/changes/21-agent-task.md README.md`: 종료 코드 0, 두 파일 포맷 통과.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 diff --check`: 종료 코드 0. 현재 추적 파일의 diff가 없으며 미추적 작업 기록은 이 명령의 검사 범위에 포함되지 않는다. 작업 기록은 위 Prettier 검사로 확인했다.

### 구현 후 확인할 완료 기준과 제한

- 구현 대상은 `docs/shared-hosting-costs.md`, README 검증·운영 부분의 상대 링크와 이 기록이다. 새 문서의 한국어 제목·설명, 확인일 2026-10-15, 서울 리전·상시 운영·트래픽·저장량 가정, 표의 계산식을 검토한다.
- 저렴한 공유 서버, 관리형 DB 분리, 정적 프런트엔드의 세 대안과 사용자 예산 범위를 보존하고 가격·성능 가정을 구분한다. 앱별 DB/스키마와 권한 분리, 자원·연결 수 관찰, 외부 백업·복원, localhost:8088 및 사설 접속 가정도 확인한다.
- 서버 한 대 전체 비용이며 앱당 비용이 아님을 확인한다. 환율·VAT 가정, 비용 제외 항목, $20 예산 알림의 한계, 인스턴스 중지만으로 모든 고정비가 없어지지 않는다는 설명을 확인한다.
- 현재 Terraform 범위와 향후 운영 대안을 구분하고, 실제 배포·부하 테스트·계정 청구액 조회·일관성 있는 DB 복구를 완료한 것으로 표현하지 않는지 검토한다.
- 구현 후 내부 링크의 실제 대상 존재와 새 문서·README·작업 기록의 Prettier 및 `git diff --check`를 확인해야 한다. 현재 새 비용 문서가 없어 최종 산출물 검토는 미완료다.
- 문서 전용 범위이므로 앱 테스트를 추가하지 않는다. 변경한 스킬이 없어 `quick_validate.py`는 적용 대상 없음. 비밀 파일·실제 백업·Terraform state에 접근하지 않았으며 배포·부하 테스트·실제 청구액 조회를 수행하지 않았다.

## 구현 단계 (2026-10-15, Asia/Seoul)

목적은 기존 #21 후속 요청의 공유 호스팅 대안과 조건부 월 예산을 한국어 문서로 보관하는 것이다. workout-implementation과 workout-testing을 적용하고 기존 이슈·브랜치를 재사용했다. 이전 검토자 지적 사항은 전달된 단계 결과에 없었다.

### 변경 파일

- `docs/shared-hosting-costs.md`: 공유 서버, 관리형 DB 분리, 정적 프런트엔드 대안과 사용자 제안 예산을 정리했다. 확인일·공식 출처·서울 리전·저장량·환율·VAT 가정, 계산식, 제외 비용, 자원·백업·접속 계획과 현재 Terraform 범위를 명시했다.
- `README.md`: 검증·운영 부분에 비용 문서 상대 링크를 추가했다.
- `docs/changes/21-agent-task.md`: 사전 단계 기록을 보존하고 실제 구현·검증 결과를 추가했다.

### 실제 검증 명령과 결과

- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short --branch`: 종료 코드 0, 기존 `feat/21-agent-task` 확인. 개인 Git ignore 파일 읽기 권한 경고가 있었지만 조회는 성공했고 설정을 변경하지 않았다.
- 웹 도구 `open`: 테스트 단계와 같은 공식 출처 4개에 접근 성공. Lightsail 기본 요금 및 ECR·RDS·Amplify 요금 페이지를 재확인했다. RDS 상세 견적과 실시간 환율은 확정하지 않았다.
- `npx --no-install prettier --write docs/shared-hosting-costs.md README.md`: 종료 코드 0, 새 문서 표 포맷 정리, README는 변경 없음.
- Node `fs`·`path`·`assert`를 사용한 `node -e` 산출물 검사: 문서 존재, README 상대 링크, UTF-8 대체문자 부재, 내부 링크 실제 대상 존재를 검사했다. 첫 실행은 작업 기록의 코드 예제에 있는 링크 문자열을 실제 Markdown 링크로 오인해 종료 코드 1. 코드 블록을 제외하도록 일회성 검사 범위를 수정한 뒤 종료 코드 0으로 통과했다. 문서나 기존 테스트 assertion을 약화·삭제하지 않았다.
- 같은 `node -e` 계산 검사: `5 * 0.10 = 0.50`, `20 * 0.05 = 1.00`, 서버 요금 합산 $13.50/$25.50, `USD * 1400` 및 `Math.round(KRW * 1.1)` 결과와 문서 표의 금액 일치를 확인했다. 종료 코드 0.
- 한국어 요구사항 수동 검토: 앱당 요금이 아닌 전체 비용, 조건부 성능·가격, 앱별 DB/스키마·권한 분리, 외부 백업·복원 계획, `localhost:8088`, 비용 제외 및 예산 알림 한계가 포함됨을 확인했다.
- `npx --no-install prettier --check docs/shared-hosting-costs.md README.md docs/changes/21-agent-task.md`: 종료 코드 0, 세 파일 포맷 통과.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 diff --check`: 종료 코드 0. 미추적 문서 2개는 Git diff 범위 밖이므로 위 Prettier·산출물 검사로 확인했다.
- 최종 `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/21 status --short`: 종료 코드 0, README 수정과 지정된 미추적 문서 2개만 확인했다.

### 제한과 후속 역할

앱 코드·Compose·Terraform·스킬·테스트는 변경하지 않았다. 문서 전용 변경이므로 앱 테스트를 추가하지 않았고 최종 앱 전체 검사를 반복하지 않았다. 사전 단계의 호스트 `npm run check` 종료 코드 0 결과는 위에 보존했으며, DB 통합 테스트 1개 skip은 DB 검증 성공을 뜻하지 않는다. 변경한 스킬이 없어 `quick_validate.py`는 적용 대상 없음이다.

실제 배포·부하 테스트·계정 청구액 조회·DB 복원 검증은 수행하지 않았다. 비밀 파일·실제 백업·Terraform state에 접근하지 않았다. 구현 변경은 미커밋 상태로 독립 검토에 전달하며 커밋·푸시·PR은 코디네이터, 병합은 사용자 담당이다.
