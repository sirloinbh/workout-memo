# Workout PostgreSQL

PostgreSQL 17. 초기 테이블은 `migrations/001_initial.sql`. Docker의 빈 데이터 볼륨에 최초 실행 시 적용됩니다. 후속 마이그레이션은 별도로 적용해야 하며, 기존 볼륨에 SQL 파일 추가만으로 자동 적용되지는 않습니다.

기존 볼륨에는 세트 메모를 추가하는 `002_set_notes.sql`을 새 API 실행 전에 적용하세요.
기존 일지와 세트는 유지되며 기존 세트 메모는 빈 문자열로 초기화됩니다. 재실행해도 안전합니다.
빈 볼륨과 CI는 모든 마이그레이션을 파일명 순서로 적용합니다.

루틴 계획 API를 사용하기 전에는 `004_routines.sql`도 적용하세요. 루틴은 부위 순서와 중복, 수동 주차 목표를 보존하는 JSON 문서로 원자적으로 저장합니다. 실제 일지나 달성 목표를 생성하지 않습니다.

```powershell
Get-Content -Raw -Encoding UTF8 database/migrations/004_routines.sql | docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1
```

```powershell
Get-Content -Raw -Encoding UTF8 database/migrations/002_set_notes.sql | docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1
```

위 명령은 기본 DB 사용자·이름 기준이며 별도로 설정했다면 해당 이름으로 바꾸세요.

일지 초안·안전한 재시도 API 실행 전에는 `003_workout_retries.sql`도 적용하세요.
기존 일지는 `version=1`로 유지되고, 수정할 때 버전이 증가합니다. 마이그레이션은 재실행해도 안전합니다.

```powershell
Get-Content -Raw -Encoding UTF8 database/migrations/003_workout_retries.sql | docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1
```

일지 POST/PUT의 UUID `Idempotency-Key`는 최초 성공 커밋부터 7일 동안 같은 메서드·대상·정규화된 내용의 결과를 재전송합니다.
같은 키의 다른 요청이나 만료 키에는 409를 반환합니다. 실패한 트랜잭션은 키를 소비하지 않습니다.
만료 키도 삭제하지 않아 과거 요청이 새 일지로 실행되는 것을 막습니다. `workout_requests`에는 본문 대신 SHA-256 지문과 응답 ID/버전을 보관합니다.
키 생략 POST는 기존 클라이언트와 호환되지만 중복 방지가 적용되지 않습니다. 새 화면은 모든 일지 저장에 키를 보냅니다.
PUT에는 조회한 양의 정수 `version`이 필수이며 누락·형식 오류는 400, 오래된 버전은 409입니다. 최신 버전을 확인해 내용을 비교한 뒤 다시 수정하세요.

화면의 초안은 기기·브라우저별 localStorage 한 곳에 한 개만 보관하며 마지막 입력부터 7일 뒤 다음 시작 시 정리합니다.
초안을 복구하거나 저장만 재시도해도 보존 기한이 연장되지는 않습니다. 서버 성공 응답 전에는 초안을 유지합니다.
여러 탭의 초안은 같은 저장 위치를 공유하므로 한 탭에서 입력하세요. 초안은 기기 간 동기화되지 않으며 통계·목표에는 서버 기록만 사용합니다.

세트 완료 상태와 선택적 RPE를 쓰는 API 실행 전에는 `006_set_completion_rpe.sql`을 적용하세요.
기존 세트는 이미 수행한 기록이므로 `completed=true`로 유지되어 목표 달성 결과가 바뀌지 않습니다. RPE는 NULL(미입력) 또는 1~10의 0.5 단위이며 서버와 DB CHECK에서 검증하고, 누락을 0으로 바꾸지 않습니다.
`completed=false`인 세트는 계획으로 보관만 하며 목표 달성·볼륨·세트 수·운동한 날에 반영하지 않습니다. `completed`를 보내지 않는 기존 클라이언트의 세트는 완료로 저장됩니다. 재실행해도 안전합니다.

```powershell
Get-Content -Raw -Encoding UTF8 database/migrations/006_set_completion_rpe.sql | docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1
```

휴식 타이머는 서버에 저장하지 않습니다. 이 브라우저의 localStorage(`workout-memo:rest-timer:v1`)에 시간 설정·자동 시작 여부·종료 시각만 보관하며, 남은 시간은 종료 시각으로 다시 계산합니다.

중량은 kg 단위 총중량(머신 기본중량 포함), 반복 수는 양의 정수입니다. 기본중량 미확인은 NULL로 유지합니다. 일지 삭제 시 세트는 CASCADE 삭제됩니다. 목표 달성은 같은 운동명의 완료한 한 세트가 설정 기간 내 중량·횟수를 모두 충족한 경우입니다.

백업은 우산 저장소 `scripts/backup.ps1`, 복원은 아래 명령으로 수행합니다. 복원 대상은 비어 있는 별도 데이터베이스로 준비하세요.

```powershell
Get-Content -Raw backups/FILE.sql | docker compose exec -T db psql -U workout -d workout_restore -v ON_ERROR_STOP=1
```
