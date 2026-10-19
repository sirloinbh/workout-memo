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

중량은 kg 단위 총중량(머신 기본중량 포함), 반복 수는 양의 정수입니다. 기본중량 미확인은 NULL로 유지합니다. 일지 삭제 시 세트는 CASCADE 삭제됩니다. 목표 달성은 같은 운동명의 한 세트가 설정 기간 내 중량·횟수를 모두 충족한 경우입니다.

백업은 우산 저장소 `scripts/backup.ps1`, 복원은 아래 명령으로 수행합니다. 복원 대상은 비어 있는 별도 데이터베이스로 준비하세요.

```powershell
Get-Content -Raw backups/FILE.sql | docker compose exec -T db psql -U workout -d workout_restore -v ON_ERROR_STOP=1
```

## 앱 내보내기·백업 (#33)

DB 스키마 변경은 없습니다(추가 마이그레이션 없음). `scripts/backup.ps1`의 SQL 덤프는 DB 전체 복구용이며 아래 두 파일과 역할이 다릅니다. 실제 백업 파일은 개인 기록이므로 저장소에 커밋하거나 로그·PR에 첨부하지 마세요(`backups/`는 git ignore 대상).

**분석용 CSV** `GET /api/export/workouts.csv[?from=YYYY-MM-DD&to=YYYY-MM-DD]`

- UTF-8(BOM 포함, 스프레드시트의 한글 인식용), RFC 4180, CRLF 줄바꿈. 세트 1개당 1행이며 세트가 없는 일지는 세트 열이 빈 1행입니다. 날짜·일지 id·세트 순서로 정렬합니다.
- 열: `workout_id, date, title, workout_notes, set_number, exercise, weight_kg, reps, volume_kg, set_notes, machine_id, brand, machine_name, machine_base_weight_kg`.
- `date`는 `YYYY-MM-DD`. `weight_kg`는 머신 기본중량을 포함한 총중량(kg), `volume_kg = weight_kg × reps`. 숫자는 소수점 `.`, 천 단위 구분 없음.
- NULL은 빈 칸입니다: 머신 없는 세트의 `machine_id`/`brand`/`machine_name`, 확인하지 못한 `machine_base_weight_kg`. 글자 열은 NULL이 아니므로 빈 칸은 빈 문자열입니다. 머신은 `machine_id`와 브랜드·이름으로 연결됩니다.
- 쉼표·큰따옴표·줄바꿈이 있는 값은 큰따옴표로 감싸고 내부 `"`는 `""`로 씁니다.
- 수식 실행 방지: 글자 값이 `=`, `+`, `-`, `@`, 탭, CR로 시작하면 앞에 `'`를 붙입니다. 따라서 CSV는 원본과 다를 수 있으며 **복원에 사용할 수 없습니다.**

**복원용 백업** `GET /api/backup` → `workout-memo-backup-YYYY-MM-DD.json`

```json
{
  "format": "workout-memo-backup",
  "version": 1,
  "exported_at": "ISO 8601",
  "data": {
    "brands": [{ "id": 1, "name": "..." }],
    "machines": [{ "id": 1, "brand_id": 1, "name": "...", "base_weight": null, "notes": "" }],
    "workouts": [
      {
        "id": 1,
        "date": "YYYY-MM-DD",
        "title": "...",
        "notes": "",
        "created_at": "ISO 8601",
        "sets": [{ "exercise": "...", "machine_id": 1, "weight": 100.25, "reps": 10, "notes": "" }]
      }
    ],
    "goals": [
      {
        "id": 1,
        "exercise": "...",
        "target_weight": 100,
        "target_reps": 5,
        "start_date": "YYYY-MM-DD",
        "deadline": "YYYY-MM-DD"
      }
    ],
    "routines": [{ "id": 1, "created_at": "ISO 8601", "plan": { "...": "루틴 API 계약과 동일" } }]
  }
}
```

- 한 REPEATABLE READ 스냅샷에서 읽습니다. `id`는 파일 안의 참조 키일 뿐이며 복원 시 새 id가 발급됩니다. 세트는 일지 안에 순서대로 들어 있고 `machine_id`→`machines.id`→`brand_id`→`brands.id`로 연결됩니다. 중량은 총중량 kg 숫자, 기본중량 미확인은 `null`입니다.
- `workout_requests`(저장 재시도 키)는 포함하지 않습니다. 기기별 일시적 중복 방지 기록이고 응답 id가 원본 DB에만 유효하기 때문입니다. 추가만 복원은 이 테이블을 건드리지 않습니다. 전체 교체는 같은 트랜잭션에서 이 테이블도 비웁니다(삭제된 일지 id를 과거 키가 재전송해 저장된 것처럼 보이는 것을 막기 위함). 이후 같은 키로 재시도하면 새 일지로 저장됩니다. 인증 정보·환경변수·Terraform state는 어떤 파일에도 들어가지 않습니다.

**복원** `POST /api/backup/preview`, `POST /api/backup/restore` — 본문 `{ "mode": "merge" | "replace", "backup": {...}, "confirm"?: "전체 교체" }`

- 요청 본문 최대 10MB(+64KB). 형식 `format`→`version`(현재 v1만 지원)→스키마(날짜·총중량·반복 수·문자 길이·목표 기간·루틴 규칙)→참조(브랜드·머신 존재, id 중복, 브랜드 이름·브랜드별 머신 이름 중복)를 검사하며 실패하면 400으로 아무것도 바꾸지 않습니다.
- `merge`(기본, 추가만): 기존 행을 수정·삭제하지 않습니다. 브랜드는 이름, 머신은 브랜드+이름으로 기존 행과 연결합니다. 머신의 기본중량·메모가 다르면 **기존 값을 유지**하고 충돌로 보고하며 복원 세트는 기존 머신에 연결합니다. 일지(세트 내용·순서 포함)·목표·루틴은 내용이 동일한 기존 행이 있으면 건너뜁니다. 동일 행 1개는 들어오는 행 1개만 흡수하므로 같은 백업을 다시 복원해도 늘지 않고, 원래 2개였던 동일 일지는 2개로 복원됩니다.
- `replace`(전체 교체): 브랜드·머신·일지·세트·목표·루틴과 저장 재시도 키(`workout_requests`)를 모두 삭제한 뒤 백업 내용으로 채웁니다. `confirm`이 정확히 `전체 교체`가 아니면 400이며 아무것도 삭제하지 않습니다.
- preview는 같은 절차를 한 트랜잭션에서 실행하고 ROLLBACK하여 추가·건너뜀·충돌·삭제 수를 돌려줍니다. restore는 같은 절차를 COMMIT합니다. 실행 중 쓰기 잠금(`LOCK ... IN EXCLUSIVE MODE`)으로 동시 저장을 기다리게 하며, 중간 오류는 전체 ROLLBACK 후 500을 반환합니다.
- 복원된 일지는 새 기록으로 `version=1`이며 `created_at`은 보존합니다. 미리보기 ROLLBACK으로 id 시퀀스에 빈 번호가 생길 수 있습니다(무해).
