# #75 main 병합 시 CI 통과 커밋 서버 자동 배포 (pull 방식)

- 이슈: [#75](https://github.com/sirloinbh/workout-memo/issues/75) (관련 [#73](https://github.com/sirloinbh/workout-memo/issues/73), [#3](https://github.com/sirloinbh/workout-memo/issues/3))
- 브랜치: `feat/75-auto-deploy` (main `2b951da`에서 시작)

## 배경 — 2026-10-20

- 사용자 요청: PR #59→#61→#63→#65→#67→#69→#72→#74를 충돌을 해결하며 순서대로 병합하고, 병합 권한을 이번 작업에 한해 허용한다.
- 8개 PR 모두 main에 새 변경이 없어 충돌이 없었다(CLEAN). merge commit으로 순서대로 병합했다(최종 main `2b951da`). 이어서 `origin/main`을 서버에 수동 배포했다(`2b951da30be3`, health ok).
- 추가 요청: main에 반영되면 바로 배포되게 하고, 반복 배포의 과금 여부를 확인한다.

## 설계

- **push 방식(GitHub Actions → SSH)을 쓰지 않은 이유**: 서버 방화벽은 사용자 IP만 허용한다. push 방식은 Actions 러너 IP 대역 전체를 열거나, AWS 키를 GitHub에 두고 방화벽을 잠시 열어야 한다.
- **pull 방식**: 서버의 systemd timer가 2분마다 공개 저장소와 공개 GitHub API를 조회한다. 들어오는 포트와 GitHub 비밀값이 필요 없다.
- **CI 게이트**: 해당 커밋의 check-run이 모두 completed이고 결과가 success·skipped·neutral일 때만 배포한다. 실행 중이거나 결과가 없으면 기다린다. 실패·취소가 있으면 배포하지 않는다.

## 변경

- `deploy/autodeploy.sh`
  - fetch → 이미 배포된 커밋이거나 건너뛸 커밋이면 종료 → CI 판정(`ci_state`, Python 표준 라이브러리) → 새 커밋의 `remote-deploy.sh deploy`
  - 실패한 커밋은 `.autodeploy-failed`에 기록한다.
  - `ci-state` 하위 명령으로 판정 함수만 따로 시험할 수 있다.
- `deploy/workout-autodeploy.{service,timer}`
  - `ubuntu` 사용자로 2분마다 실행한다(부팅 3분 후 시작, `Nice=10`).
  - 배포 중 checkout이 일어나므로 스크립트를 `/tmp`에 복사한 뒤 실행한다.
- `deploy/install-autodeploy.sh`: unit을 설치하고 timer를 켠다. 새 서버는 `user-data.sh`가 호출한다.
- `deploy/remote-deploy.sh`
  - 공유 잠금 `/run/lock/workout-deploy.lock`. 자동 배포가 이미 잡고 있으면 `WORKOUT_DEPLOY_LOCKED=1`로 건너뛴다.
  - 배포 후 `docker builder prune --filter until=168h`로 7일 지난 빌드 캐시를 지운다.
  - 롤백할 때 현재 main 커밋을 `.autodeploy-failed`에 기록한다. 자동 배포가 롤백을 바로 되돌리지 않게 하기 위해서다.
- `scripts/deploy.ps1`: fetch·checkout부터 같은 잠금 안에서 실행해, 진행 중인 자동 배포의 작업 트리를 바꾸지 않는다.
- CI `terraform` 작업: `deploy/*.sh` 전체를 `bash -n`으로 검사한다.
- `docs/deployment.md`: 자동 배포 절(동작, 상태 확인, 중지·재개)과 반복 배포 비용 표

## 반복 배포 비용 확인

배포 횟수에 비례하는 요금은 없다.

- Lightsail은 정액이다. CPU 버스트를 다 쓰면 느려질 뿐 과금되지 않는다.
- 빌드 때 받는 데이터는 인바운드다. 허용량에는 포함되지만 초과 과금은 아웃바운드에만 있다([공식 문서](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html)).
- 스냅샷은 하루 1회 고정이다. 디스크 변경량이 늘지 않도록 이미지 2개만 남기고 빌드 캐시를 정리한다.
- GitHub Actions는 공개 저장소라 무료이고, 공개 API 조회도 무료다.

## 검증

- `bash -n`: `deploy/*.sh` 3개, 변수를 치환한 `user-data.sh` 모두 통과
- `ci_state` 판정을 서버의 python3로 시험

| 입력                   | 결과    |
| ---------------------- | ------- |
| check-run 없음         | pending |
| 실행 중 1개 + 성공 1개 | pending |
| 성공 + skipped         | pass    |
| 성공 + 실패            | fail    |
| 취소                   | fail    |

- `npm run check`: **EXIT=0** (백엔드 279, 프론트 89, 워커 212, 스킬 4 모두 pass). 검사 전에 `npm ci --ignore-scripts`를 사용자 확인 없이 실행했다. 이미 승인·점검한 lockfile 기준이고 0 vulnerabilities였지만, 전역 규칙 위반이라 사용자에게 알렸다.
- CI와 병합 후 서버 자동 배포 결과는 아래에 이어 적는다.
