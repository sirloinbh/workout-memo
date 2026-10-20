# 배포·운영 (Lightsail)

개인 계정의 Lightsail 서버 한 대에서 Docker Compose(웹·API·PostgreSQL)로 운영합니다(#73). 허용한 IP에서만 접속할 수 있습니다.

## 구성과 비용

| 항목                        | 값                                                                         | 월 비용(세전, 추정)        |
| --------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Lightsail `micro_3_0`, 서울 | 1GB RAM, 40GB SSD, 공인 IPv4, 2TB 전송, Ubuntu 24.04                       | $7.00                      |
| 고정 IP                     | 인스턴스에 연결된 동안                                                     | $0                         |
| 자동 스냅샷                 | 매일 03:00(서울), AWS가 최근 7개 보관, 사용 용량 기준 $0.05/GB-month       | 약 $1 미만                 |
| DB 덤프                     | 매일 03:30(서울), 서버 `/var/backups/workout`에 14일 보관(스냅샷에도 포함) | $0                         |
| 로그                        | Docker json-file 컨테이너당 10MB×3 순환                                    | $0                         |
| AWS Budgets                 | $10. 실제 지출 50%·80%, 예상 지출 100%에서 이메일                          | 무료(알림만 쓰는 예산)     |
| 합계                        |                                                                            | **약 $7~8** (VAT 10% 별도) |

- 예산 알림은 지출을 막지 않습니다. 개인 계정 전체 비용을 대상으로 합니다.
- 비용 근거: [Lightsail 요금](https://aws.amazon.com/lightsail/pricing/), [Budgets 요금](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/). 실제 청구액은 결제 시점의 요금·세금을 따릅니다.
- 이번 구성에서 제외한 것은 ECR, S3, CloudWatch Logs입니다. 비용이 늘고, 서버에 장기 AWS 키를 둬야 하기 때문입니다. 이미지는 서버가 공개 저장소의 커밋을 직접 빌드하고, 커밋 태그로 보관합니다.
- 도메인이 없어 HTTP로 접속합니다. IP 제한은 걸리지만 전송 구간은 암호화되지 않습니다. 공용 Wi-Fi에서는 SSH 터널로 접속하세요(아래 참고).

## 1. 처음 한 번 준비

1. **개인 계정 AWS CLI 프로필**: 회사 프로필과 섞이지 않도록 이름을 붙여 만듭니다. 예: `workout-personal`. Lightsail·Budgets 권한이 있는 IAM 사용자 키나 SSO를 씁니다. 키는 본인이 직접 입력하고 저장소·채팅에 남기지 않습니다.
   ```powershell
   aws configure --profile workout-personal
   aws sts get-caller-identity --profile workout-personal   # 개인 계정 ID인지 확인
   ```
2. **SSH 키**: 이 서버 전용으로 만듭니다. 개인키는 PC에만 둡니다.
   ```powershell
   ssh-keygen -t ed25519 -f $HOME/.ssh/workout-memo-lightsail -C workout-memo
   ```
3. **변수 파일**: `infrastructure/terraform.tfvars.example`을 `infrastructure/terraform.tfvars`로 복사하고 값을 채웁니다. 이 파일은 git에서 제외됩니다.
   - `aws_profile`
   - `expected_account_id`: 다른 계정이면 plan이 실패합니다.
   - `allowed_cidrs`: 예 `["1.2.3.4/32"]`. 현재 공인 IP는 `https://checkip.amazonaws.com`에서 확인합니다.
   - `budget_emails`

## 2. 인프라 적용

```powershell
cd infrastructure
terraform init
terraform plan -out=deploy.tfplan     # 생성 목록과 계정 확인
terraform apply deploy.tfplan
terraform output                      # static_ip, url, ssh
```

- 만들어지는 것: SSH 키 등록, 인스턴스, 고정 IP와 연결, 방화벽(22·80을 허용 IP에만 개방, IPv6 비활성), 월 예산 알림.
- 첫 부팅 때 `user-data.sh`가 실행됩니다. Lightsail은 user_data를 `/bin/sh`로 실행하므로, 이 파일은 sh 래퍼가 bash 스크립트(`/usr/local/sbin/workout-init`)를 써서 실행하는 구조입니다. swap 2GB, Docker·Compose 설치, 저장소 clone, DB 비밀번호 생성(서버 `.env`, 외부로 나가지 않음), 백업 cron을 설정합니다. 몇 분 걸립니다.
- Terraform state(`terraform.tfstate`)는 이 PC의 `infrastructure/`에만 있고 git에서 제외됩니다. state를 잃으면 리소스를 Terraform으로 관리할 수 없으므로 안전한 곳에 따로 백업합니다.

## 3. 앱 배포·롤백

```powershell
./scripts/deploy.ps1 -Server <static_ip> -Ref origin/main   # 배포
./scripts/deploy.ps1 -Server <static_ip> -Rollback          # 직전 배포로 되돌림
```

배포 순서(`deploy/remote-deploy.sh`):

1. 서버 초기화가 끝날 때까지 기다린다(`cloud-init status --wait`).
2. ref를 fetch·checkout하고 커밋 태그(12자리)로 이미지를 빌드한다.
3. 이전 배포가 있으면 DB 덤프를 먼저 만든다.
4. DB를 시작하고, API 이미지 안에서 `node dist/migrate.js`로 마이그레이션을 적용한다(`schema_migrations` 기록). 첫 배포에서는 빈 볼륨을 Docker 초기화가 만들고, 이 단계가 기준선을 기록한다.
5. 전체를 시작하고 `http://127.0.0.1/api/health`를 최대 60초 확인한다.
6. health가 실패하면 이전 커밋의 이미지로 다시 시작하고 실패로 끝난다.
7. 성공하면 `.deployed`·`.previous`를 기록하고, 현재·직전 이미지만 남긴다.

- 롤백은 다시 빌드하지 않고 직전 이미지로 바로 시작합니다.
- 마이그레이션은 되돌리지 않습니다. 새 스키마에서 이전 앱이 동작하지 않거나 데이터를 되돌려야 하면, 배포 직전 덤프로 복원합니다(아래 5).
- 로컬 동작은 바뀌지 않습니다. `compose.yaml`은 `IMAGE_TAG`·`WEB_BIND`·`WEB_PORT`·`DB_PORT` 변수를 쓰고, 기본값은 기존과 같습니다(이미지 `local`, 웹 `127.0.0.1:8088`, DB `127.0.0.1:55432`). 서버 `.env`만 웹을 `0.0.0.0:80`으로 엽니다.

## 3-1. main 자동 배포 (#75)

main에 병합되면 서버가 직접 확인해서 배포합니다(pull 방식). 서버 방화벽은 GitHub에 열지 않고, GitHub에도 AWS·SSH 키를 저장하지 않습니다.

- `workout-autodeploy.timer`가 2분마다 `deploy/autodeploy.sh`를 실행합니다(부팅 3분 후 시작).
  1. `origin/main`을 fetch합니다. 이미 배포한 커밋이면 끝납니다.
  2. 그 커밋의 GitHub Actions check-run을 공개 API로 조회합니다(인증 없이 시간당 60회, 대기 중일 때만 호출).
     - 실행 중이거나 결과가 아직 없으면 다음 회차에 다시 확인합니다.
     - 실패·취소가 하나라도 있으면 그 커밋은 배포하지 않습니다.
     - 모두 성공(또는 skipped·neutral)이면 3번으로 갑니다.
  3. 새 커밋의 `deploy/remote-deploy.sh deploy`를 실행합니다. 순서는 수동 배포와 같습니다(배포 전 덤프 → 마이그레이션 → health → 실패 시 이전 이미지).
  4. 실패한 커밋은 `.autodeploy-failed`에 기록하고 다시 시도하지 않습니다. 다음 커밋이 오면 다시 시작합니다.
- 수동 배포·롤백과 자동 배포는 같은 잠금(`/run/lock/workout-deploy.lock`)을 써서 동시에 실행되지 않습니다.
- 수동 롤백은 현재 main 커밋을 건너뛸 커밋으로 기록합니다. 그래서 자동 배포가 그 커밋을 곧바로 다시 올리지 않고, 다음 main 커밋부터 다시 배포합니다.
- 병합부터 배포까지 걸리는 시간은 CI(약 2~3분), 확인 주기(최대 2분), 서버 빌드(수 분)를 더한 정도입니다.
- 상태 확인과 제어(서버에서):
  ```bash
  systemctl list-timers workout-autodeploy.timer          # 다음 실행 시각
  journalctl -u workout-autodeploy -n 50 --no-pager       # 최근 기록
  cat /opt/workout-memo/.deployed                          # 배포 중인 커밋
  sudo systemctl stop workout-autodeploy.timer             # 일시 중지
  sudo systemctl start workout-autodeploy.timer            # 재개
  rm /opt/workout-memo/.autodeploy-failed                  # 건너뛴 커밋 다시 시도
  ```
- 새 서버는 user-data가 timer를 설치합니다. 기존 서버는 `sudo bash /opt/workout-memo/deploy/install-autodeploy.sh`로 설치합니다.

### 여러 번 배포할 때의 비용

배포 횟수 자체로 추가되는 요금은 없습니다. 근거는 다음과 같습니다.

| 항목               | 반복 배포의 영향                                                                                                                                                                                    | 과금                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Lightsail 인스턴스 | 정액 월 $7. 빌드 중 CPU를 많이 써도 요금은 같고, 버스트 한도를 넘으면 느려질 뿐입니다                                                                                                               | 없음                                          |
| 데이터 전송        | 빌드 때 받는 이미지·npm 패키지·git은 인바운드 트래픽입니다. 2TB 허용량에는 포함되지만, 초과 과금은 아웃바운드에만 적용됩니다                                                                        | 없음(아웃바운드 2TB 초과 시에만 $0.09/GB부터) |
| 스냅샷             | 하루 1회 고정이며 배포 횟수와 무관합니다. 다만 디스크 변경량이 크면 증분 크기가 늘어 $0.05/GB-month가 조금 늘 수 있습니다. 그래서 배포마다 현재·직전 이미지만 남기고, 7일 지난 빌드 캐시를 지웁니다 | 미미                                          |
| 배포 전 DB 덤프    | 서버 디스크에 14일 보관. 수 KB~MB 수준입니다                                                                                                                                                        | 없음                                          |
| GitHub Actions     | 공개 저장소라 표준 러너가 무료입니다                                                                                                                                                                | 없음                                          |
| GitHub API 조회    | 공개 API, 인증 없음                                                                                                                                                                                 | 없음                                          |
| ECR·S3·CloudWatch  | 사용하지 않음                                                                                                                                                                                       | 없음                                          |

[Lightsail 요금](https://aws.amazon.com/lightsail/pricing/), [Lightsail 데이터 전송](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html). 예상 밖의 비용은 월 $10 예산 알림(50%·80%·예상 100%)으로 확인합니다.

## 4. 접속

- **브라우저**: `http://<static_ip>`. 허용 IP에서만 열립니다.
- **SSH**: `ssh -i ~/.ssh/workout-memo-lightsail ubuntu@<static_ip>`
- **SSH 터널**(전송 암호화): `ssh -i ~/.ssh/workout-memo-lightsail -L 8088:127.0.0.1:80 ubuntu@<static_ip>`를 실행한 뒤 `http://localhost:8088`로 접속합니다.
- **로그**: 서버에서 `cd /opt/workout-memo && docker compose logs --tail 100 api`

## 5. 백업·복원

- **자동**
  - 매일 03:00 Lightsail 스냅샷: 서버 전체이며, 콘솔에서 새 인스턴스로 복원할 수 있습니다.
  - 매일 03:30 DB 덤프: `/var/backups/workout/workout-<날짜>.sql.gz`, 실행 로그는 `/var/log/workout-backup.log`.
- **수동 덤프**: `/usr/local/bin/workout-backup`
- **PC로 가져오기**: `scp -i ~/.ssh/workout-memo-lightsail ubuntu@<ip>:/var/backups/workout/<파일> ./backups/`. `backups/`는 git에서 제외됩니다.
- **복원 확인**(서버, 별도 DB에): 아래 명령으로 복원한 뒤 `workouts`·`schema_migrations` 행을 확인합니다. 로컬에서 같은 명령으로 덤프 → 복원 → 일지·이력 9행 확인을 검증했습니다.
  ```bash
  cd /opt/workout-memo
  docker compose exec -T db createdb -U workout workout_restore
  gunzip -c /var/backups/workout/<파일> | docker compose exec -T db psql -q -U workout -d workout_restore -v ON_ERROR_STOP=1
  ```
- **운영 DB를 덤프로 교체**: 앱을 멈추고(`docker compose stop api web`), 위 방법으로 `workout`을 다시 만들어 복원한 뒤 다시 시작합니다. 되돌릴 수 없는 작업이므로 직전 덤프를 먼저 만듭니다.
- 앱 화면의 "백업·내보내기" JSON 백업도 PC 보관용으로 함께 씁니다.

## 6. 허용 IP 바꾸기

`terraform.tfvars`의 `allowed_cidrs`에 추가·삭제한 뒤 `terraform apply`를 실행합니다. 방화벽 규칙만 바뀌고 인스턴스는 그대로입니다. 전체 공개(`/0`)는 변수 검증에서 거부됩니다.

## 7. 알람(선택)

Terraform AWS provider에는 Lightsail 지표 알람 리소스가 없습니다. 필요하면 CLI로 만듭니다. 알람당 월 약 $0.10이며, 이메일 연락처는 AWS 확인 메일을 승인해야 동작합니다.

```powershell
aws lightsail create-contact-method --profile workout-personal --protocol Email --contact-endpoint <이메일>
aws lightsail put-alarm --profile workout-personal --alarm-name workout-memo-status --monitored-resource-name workout-memo-app --metric-name StatusCheckFailed --comparison-operator GreaterThanOrEqualToThreshold --threshold 1 --evaluation-periods 2 --notification-enabled --contact-protocols Email
```

## 8. 철거

`terraform destroy`를 실행하면 인스턴스·고정 IP·방화벽·예산이 삭제되고, 서버 안의 DB와 덤프도 함께 사라집니다. 필요한 백업을 먼저 PC로 가져옵니다. 자동 스냅샷은 인스턴스 삭제 후에도 남아 비용이 나올 수 있으므로 Lightsail 콘솔에서 확인합니다.
