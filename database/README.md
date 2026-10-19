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

중량은 kg 단위 총중량(머신 기본중량 포함), 반복 수는 양의 정수입니다. 기본중량 미확인은 NULL로 유지합니다. 일지 삭제 시 세트는 CASCADE 삭제됩니다. 목표 달성은 같은 운동명의 한 세트가 설정 기간 내 중량·횟수를 모두 충족한 경우입니다.

백업은 우산 저장소 `scripts/backup.ps1`, 복원은 아래 명령으로 수행합니다. 복원 대상은 비어 있는 별도 데이터베이스로 준비하세요.

```powershell
Get-Content -Raw backups/FILE.sql | docker compose exec -T db psql -U workout -d workout_restore -v ON_ERROR_STOP=1
```
