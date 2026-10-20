# #73 Lightsail 첫 배포·IP 허용 리스트·$10 예산·백업·롤백

- 이슈: [#73](https://github.com/sirloinbh/workout-memo/issues/73) (로드맵 [#3](https://github.com/sirloinbh/workout-memo/issues/3) 5단계)
- 브랜치: `feat/73-lightsail-deploy`. #70(PR #72) 위에 쌓았다. 서버 배포에서 #58의 `migrate`를 쓴다.

## 사용자 결정 — 2026-10-20

1. 가장 저렴한 구성
2. IP 허용 리스트
3. 월 비용 한도 $10
4. 백업·로그 보관값은 추천값

배포 계정은 개인 계정(327230665171)이다. 알림 이메일은 사용자가 알려 준 두 주소이며, git에서 제외되는 `terraform.tfvars`에만 넣는다. 허용 IP는 우선 현재 PC의 공인 IP 하나다.

## 선택과 근거

- **Lightsail `micro_3_0`($7)**: 서울 리전 `get-bundles` 조회 결과, IPv4 포함 요금은 nano $5(0.5GB) / micro $7(1GB) / small $12(2GB)였다. 0.5GB는 PostgreSQL·API·nginx와 서버 빌드를 감당하기 어렵다. EC2(t4g.micro + 공인 IPv4 + EBS)는 서울 리전에서 $10을 넘는다.
- **ECR·S3·CloudWatch Logs 제외**: Lightsail 인스턴스에는 IAM 역할을 붙일 수 없어 장기 액세스 키를 서버에 둬야 하고, 비용도 늘어난다. 대신 공개 저장소의 커밋을 서버에서 빌드하고 커밋 태그 이미지로 롤백한다.
- **백업 추천값**
  - 매일 03:00 Lightsail 자동 스냅샷: AWS가 최근 7개를 보관한다.
  - 매일 03:30 `pg_dump`: 서버에 14일 보관하고 스냅샷에도 포함된다.
  - 배포 직전 덤프
  - Docker 로그: 컨테이너당 10MB×3 순환
- **Budgets 알림**: $10의 실제 지출 50%·80%, 예상 지출 100%
- **HTTPS 없음**: 도메인이 없어 HTTP로 운영한다. IP 제한으로 접근은 막지만 전송 구간은 암호화되지 않으므로, SSH 터널 방법을 문서에 적었다.

## 변경

- `infrastructure/`
  - `versions.tf`: provider에 `profile = var.aws_profile`을 명시했다.
  - `variables.tf`: `allowed_cidrs`(1개 이상, `/0` 거부), `expected_account_id`(12자리), 예산·백업 기본값
  - `main.tf`
    - `terraform_data.account_guard`: 자격 증명의 계정이 `expected_account_id`와 다르면 plan이 실패한다.
    - 리소스: SSH 키 등록, 인스턴스(Ubuntu 24.04, IPv4 전용, 자동 스냅샷, `user_data` 변경 무시), 고정 IP와 연결, 방화벽(22·80을 허용 CIDR에만), 월 예산(알림 3개)
    - 기존 초안의 공유 ECR 2개와 $20 예산은 이번 구성에서 쓰지 않아 삭제했다. 실제로 적용된 적은 없다.
  - `outputs.tf`: 고정 IP, URL, SSH 명령, 허용 CIDR
  - `user-data.sh`: 서울 시간대, swap 2GB, Ubuntu 저장소의 `docker.io`·`docker-compose-v2`, 로그 순환, 저장소 clone, 서버에서 DB 비밀번호 생성, 웹 `0.0.0.0:80`, 백업 스크립트와 cron
  - `terraform.tfvars.example`: 개인 값 예시. 실제 파일은 `*.tfvars` ignore 대상이다.
- `compose.yaml`
  - `image: workout-{backend,frontend}:${IMAGE_TAG:-local}`
  - 웹 `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8088}`, DB `127.0.0.1:${DB_PORT:-55432}`
  - 로컬 기본 동작은 그대로다.
- `deploy/remote-deploy.sh`: 서버의 `deploy <ref>` / `rollback`
  - 순서: 빌드 → 배포 전 덤프 → `node dist/migrate.js` → 시작 → health check
  - health check가 실패하면 이전 이미지로 다시 시작한다.
  - 현재·직전 이미지만 남긴다.
- `scripts/deploy.ps1`: ssh로 서버 스크립트를 실행한다. 서버 초기화 대기와 ref 형식 검사를 포함한다.
- `docs/deployment.md`(신규): 구성·비용, 준비(개인 프로필, SSH 키, tfvars), 적용, 배포·롤백, 접속, 백업·복원, IP 변경, 알람(CLI), 철거
- CI `terraform` 작업: `fmt -check`, `init -backend=false`, `validate`, `bash -n`
- README·AGENTS.md·`infrastructure/README.md` 갱신

## 검증 (로컬)

| 검사                                                                              | 결과                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `terraform fmt -check`, `terraform validate`                                      | 통과                                                         |
| `bash -n deploy/remote-deploy.sh`, 변수를 치환한 `user-data.sh`                   | 통과(LF 확인)                                                |
| 별도 Compose 프로젝트로 서버 절차 시험(`IMAGE_TAG=deploytest`, 웹 8099, DB 55499) | `docker compose config` 통과, 이미지 빌드·태그 확인          |
| 빈 볼륨에서 API 이미지 안의 `node dist/migrate.js`                                | 9개 기준선 기록, 재실행 시 "적용할 마이그레이션이 없습니다." |
| `/api/health` (웹 프록시 경유)                                                    | `{"status":"ok"}`                                            |
| 일지 1건 저장 → `pg_dump \| gzip` → 별도 DB 복원                                  | 복원 성공, 일지와 `schema_migrations` 9행 확인               |
| 시험 스택 정리                                                                    | `down -v`, 시험 이미지 삭제                                  |

`npm run check`: **EXIT=0** (백엔드 279, 프론트 89, 워커 212, 스킬 4 모두 pass, fail·skip 0).

## 실제 적용과 서버 검증 — 2026-10-20

사용자가 개인 계정 프로필 `workout-personal`을 설정했다. 계정 327230665171임을 `sts get-caller-identity`로 확인한 뒤 진행했다.

- 배포 전용 SSH 키 `~/.ssh/workout-memo-lightsail`을 만들었다(빈 암호 확인). `terraform.tfvars`가 git 제외 대상인 것도 확인했다.
- `terraform plan`: 생성 7, 변경·삭제 0. 계정 가드를 통과했다. 사용자 확인 후 `terraform apply`로 7개를 모두 생성했다. 고정 IP는 3.38.114.136이다.
- **첫 배포 실패와 수정**
  - **user_data**: Lightsail은 자체 명령을 앞에 붙여 user_data를 `/bin/sh`로 실행한다. 그래서 `set -o pipefail`에서 중단됐다(`Illegal option -o pipefail`). 로컬 `bash -n`으로는 잡을 수 없는 문제였다. sh 래퍼가 bash 스크립트를 파일로 쓰고 `bash`로 실행하도록 바꿨다. 같은 렌더 결과를 서버에서 `sudo sh`로 실행해 exit 0을 확인했다. 기존 인스턴스는 `ignore_changes` 덕분에 다시 만들어지지 않았다.
  - **deploy.ps1**: ssh의 known-hosts 알림(stderr)이 PowerShell 5.1의 `Stop` 설정에서 종료 오류가 됐다. ssh 실행 구간은 종료 코드로만 판단하도록 바꿨다. cloud-init이 `error` 상태로 남아도, 초기화 결과물(`/usr/local/bin/workout-backup`)이 있으면 진행한다.
  - **remote-deploy.sh**: 지울 이미지가 없을 때 `grep`의 종료 코드 1이 `pipefail` 때문에 실패로 처리됐다. 배포 자체는 health를 통과해 `.deployed`까지 기록된 상태였다. `{ grep … || true; }`로 고쳤다. health 재시도 중 나오는 curl 메시지도 숨겼다.
- **서버 검증**

| 검사                                           | 결과                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 서버 초기화                                    | Docker 29.1.3, Compose 2.40.3, swap 2GB, `.env` 600 권한, 백업 cron, 시간대 Asia/Seoul        |
| 방화벽(`get-instance-port-states`)             | 22·80만 `1.215.143.251/32`에 개방, IPv6 규칙 없음, `ipAddressType=ipv4`                       |
| 자동 스냅샷 add-on                             | Enabled, 18:00 UTC(서울 03:00)                                                                |
| 첫 배포 `db2385dd8e29`                         | 빈 볼륨 초기화 후 마이그레이션 기준선 9건, health `{"status":"ok"}`                           |
| 허용 IP(이 PC)에서 접속                        | `/api/health` 200, `/` 200, `/journal` 직접 접근 200                                          |
| 서버 대상 Playwright(임시 설정, 커밋하지 않음) | **2 passed**: 일지 CRUD와 새로고침·뒤로 가기. 종료 후 일지 0건                                |
| 수동 백업 `workout-backup`                     | 덤프 생성, exit 0                                                                             |
| 두 번째 배포 `7be918e12d36`                    | 배포 전 덤프 생성, 마이그레이션 "적용할 것 없음", `.previous=db2385dd8e29`, 이미지 2개만 보관 |
| 수동 롤백                                      | 다시 빌드하지 않고 `db2385dd8e29`로 전환, health ok, `.deployed`·`.previous` 교체             |

## 아직 확인하지 못한 것

- **허용하지 않은 IP에서의 차단**: 다른 네트워크에서 접속해 보지는 않았다. 방화벽 규칙이 허용 CIDR 하나만 열려 있다는 것을 API로 확인한 것이 근거다.
- **health 실패 시 자동 복원 분기**: 실패하는 버전을 배포해 보지 않았다. 같은 `start` 함수를 쓰는 수동 롤백은 실제로 확인했다.
- **매일 03:30 cron 백업과 03:00 자동 스냅샷의 실제 생성**: 첫 실행 시각이 지나야 확인할 수 있다.
- **배포 대상**: 지금은 미병합 PR이 모두 포함된 `feat/73-lightsail-deploy`다. PR들이 병합되면 `./scripts/deploy.ps1 -Server 3.38.114.136 -Ref origin/main`으로 다시 배포한다.
