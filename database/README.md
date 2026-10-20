# Workout PostgreSQL

PostgreSQL 17. 스키마의 관리 원본은 `migrations/NNN_name.sql` 하나이며 파일명 순서로 적용합니다. Docker의 빈 데이터 볼륨은 최초 실행 시 모든 파일을 적용합니다. 기존 볼륨에 SQL 파일을 추가하는 것만으로는 적용되지 않습니다.

## 마이그레이션 적용 (#58)

새 API를 실행하기 전에 우산 저장소 루트에서 실행하세요. `.env`의 `DATABASE_URL`(호스트 포트 55432)을 사용하며, 이미 설정된 환경변수가 있으면 그 값이 우선합니다.

```powershell
npm run db:migrate              # 미적용 파일만 순서대로 적용
npm run db:migrate -- --status  # 적용됨/대기 목록만 확인(DB 변경 없음)
```

- 적용 이력은 `schema_migrations`(파일명, 체크섬, 적용 시각)에 남습니다. 파일 하나와 그 이력 행은 한 트랜잭션으로 커밋됩니다. 중간 파일이 실패하면 그 파일만 ROLLBACK하고 중단하며, 앞서 적용한 파일은 기록된 상태로 남습니다. 원인을 고친 뒤 다시 실행하면 실패한 파일부터 이어서 적용합니다.
- 동시에 실행해도 advisory lock으로 한 번에 하나씩 적용합니다.
- 다음 경우에는 아무것도 적용하지 않고 실패합니다. 적용한 파일의 내용을 바꾼 경우(체크섬 불일치, 줄바꿈과 UTF-8 BOM 차이는 무시), 적용한 파일을 삭제한 경우, 이미 적용한 번호보다 앞선 새 파일이 생긴 경우, 번호가 중복되거나 이름이 형식에 맞지 않는 경우. 적용한 파일은 고치지 말고 새 번호의 파일을 추가하세요.
- 이력이 없는 기존 DB에서 처음 실행하면 001부터 모든 파일을 다시 적용하고 기록합니다. 001~009는 모두 재실행해도 안전하므로 기존 일지·세트·머신 값은 바뀌지 않습니다. 009는 공식 참고 행을 같은 키로 다시 갱신합니다.
- Node가 파일을 UTF-8로 직접 읽으므로, 아래 PowerShell 파이프 방식에서 생기는 한글 손상이 없습니다.
- **새 마이그레이션도 재실행해도 안전하게 작성하세요**(`IF NOT EXISTS`, `ON CONFLICT` 등). 빈 볼륨에서는 Docker 초기화가 이력 없이 파일을 먼저 실행하고, 이후 `db:migrate`가 같은 파일을 다시 적용하며 기록하기 때문입니다.
- 실패 시 복구: 오류 메시지의 파일명과 원인을 확인합니다. 데이터 문제라면 백업(`scripts/backup.ps1`)을 먼저 만든 뒤 원인을 고치고 다시 실행하세요. 체크섬 불일치는 파일을 git의 원래 내용으로 되돌리면 해결됩니다.

아래의 파일별 psql 명령은 `db:migrate` 도입 전 절차이며 이력을 남기지 않습니다. 이미 그렇게 적용한 DB도 `db:migrate`를 한 번 실행하면 기준선으로 기록됩니다.

## PowerShell 파이프를 쓰지 않는 이유 (#55)

Windows PowerShell 5.1은 외부 프로그램과 파이프로 텍스트를 주고받을 때 UTF-8을 그대로 전달하지 않습니다. 보낼 때는 `$OutputEncoding`(기본 ASCII)으로, 받을 때는 콘솔 코드 페이지(한국어 Windows 기본 CP949)로 변환합니다. 그래서 `Get-Content … | docker compose exec … psql`로 마이그레이션을 적용하면 001의 `'기타'`가 `'??'` 브랜드로 추가되고, 009의 한글 참고 데이터가 깨진 중복 행으로 들어갑니다. 백업도 `pg_dump` 출력을 변수로 받으면 `기타`가 `湲고?`로 깨진 채 저장됩니다.

- 마이그레이션은 `npm run db:migrate`(Node가 UTF-8로 직접 읽음)를 씁니다. 파일 하나만 적용해야 하면 compose가 마운트한 컨테이너 안의 파일을 `psql -f`로 실행합니다(아래 명령들).
- 백업은 `scripts/backup.ps1`이 컨테이너 안에서 파일로 덤프한 뒤 `docker compose cp`로 바이트 그대로 꺼냅니다. 복원도 파일을 컨테이너로 복사한 뒤 `-f`로 실행합니다.
- 문서의 PowerShell 예시에 파이프 방식이 다시 들어오면 `npm run test:docs`가 실패합니다.

예전에 파이프 방식으로 적용한 DB에 깨진 행이 남아 있는지는 아래 조회로 확인합니다. 조회만 하며 자동으로 삭제하지 않습니다. 결과가 있으면 백업을 먼저 만들고, 깨진 행을 참조하는 머신이 없는지 확인한 뒤 직접 정리하세요.

```powershell
docker compose exec -T db psql -U workout -d workout -c "SELECT id, name FROM brands WHERE name LIKE '%?%'"
docker compose exec -T db psql -U workout -d workout -c "SELECT id, brand, lineup, model_name FROM official_machine_weights WHERE concat_ws(' ', brand, lineup, model_name, setting, notes) LIKE '%?%'"
```

기존 볼륨에는 세트 메모를 추가하는 `002_set_notes.sql`을 새 API 실행 전에 적용하세요.
기존 일지와 세트는 유지되며 기존 세트 메모는 빈 문자열로 초기화됩니다. 재실행해도 안전합니다.
빈 볼륨과 CI는 모든 마이그레이션을 파일명 순서로 적용합니다.

루틴 계획 API를 사용하기 전에는 `004_routines.sql`도 적용하세요. 루틴은 부위 순서와 중복, 수동 주차 목표를 보존하는 JSON 문서로 원자적으로 저장합니다. 실제 일지나 달성 목표를 생성하지 않습니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/004_routines.sql
```

루틴 목표·오늘 하루 휴식하기 API(#28) 전에는 `004_routines.sql` 다음에 `005_routine_progress.sql`을 적용하세요. `routine_rests`에 루틴별 휴식 날짜만 한 행씩 저장하며(같은 날 중복 불가), 이동된 일정과 '제외됨' 목표는 이 날짜로부터 계산합니다. 기존 일지·세트·루틴은 바뀌지 않으며 재실행해도 안전합니다. 루틴을 삭제하면 휴식 기록도 함께 삭제됩니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/005_routine_progress.sql
```

종목 분석(종목별 PR·추정 1RM·부위별 주간 운동량) API를 사용하기 전에는 `007_exercise_body_parts.sql`도 적용하세요. 사용자가 직접 지정한 운동→부위 매핑만 보관합니다. 운동명은 목표 판정과 같은 규칙(`lower(trim(운동명))`)으로 정규화한 값으로 저장하며 운동명에서 부위를 추측하지 않습니다. 매핑이 없는 운동은 `미분류`로 집계합니다. 기존 일지·세트는 변경하지 않으며 재실행해도 안전합니다. PR과 주간 통계는 저장하지 않고 조회할 때마다 계산합니다. 완료하지 않은(`completed=false`) 계획 세트는 PR·추정 1RM·주간 운동량에 반영하지 않습니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/007_exercise_body_parts.sql
```

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/002_set_notes.sql
```

신체 기록 API를 사용하기 전에는 `008_body_measurements.sql`도 적용하세요. 재실행해도 안전합니다(`CREATE TABLE IF NOT EXISTS`).
`body_measurements`는 날짜(`date`, UNIQUE)마다 한 행이며 `body_weight_kg`·`skeletal_muscle_kg`(kg, 0 초과)와 `body_fat_percent`(%, 0~100)를 `NUMERIC(5,2)`로 저장합니다. 측정하지 않은 값은 NULL이며 세 값이 모두 NULL인 행은 CHECK 제약으로 거부합니다. API는 소수점 셋째 자리 이상의 입력을 반올림하지 않고 400으로 거부합니다. 같은 날짜의 생성 요청은 409이며 수정(PUT)으로 바꿉니다. 운동 일지와 외래키로 연결하지 않으므로 일지 삭제가 신체 기록에 영향을 주지 않습니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/008_body_measurements.sql
```

위 명령은 기본 DB 사용자·이름 기준이며 별도로 설정했다면 해당 이름으로 바꾸세요.

머신 공식 참고값을 사용하는 새 API 실행 전에는 `009_official_machine_weights.sql`도 적용하세요. 제조사 공식 시작 저항(공무게) 참고 테이블 `official_machine_weights`를 만들고 조사 결과를 넣으며, `machines.official_weight_id` 선택 연결 열과 `Newtech` 브랜드(이미 있으면 건너뜀)를 추가합니다. 기존 머신의 기본중량과 과거 세트 총중량은 변경하지 않고 기존 머신의 연결은 NULL로 시작합니다. 재실행하면 참고 행을 같은 키로 갱신하며 안전합니다. 이 마이그레이션 없이 새 API를 실행하면 머신 목록 조회가 실패합니다. 조사 기준과 출처는 [docs/machine-official-weights.md](../docs/machine-official-weights.md)를 참고하세요. 이 파일은 한글 값을 포함하므로 파이프 대신 compose가 마운트한 컨테이너 안의 파일을 직접 실행하세요. Windows PowerShell 5.1은 네이티브 프로그램으로 파이프할 때 텍스트를 ASCII로 보내 한글(온힘·뉴텍·비고)을 손상시키고, 손상된 값은 재실행 시 UNIQUE 키 일치도 깨뜨립니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/009_official_machine_weights.sql
```

일지 초안·안전한 재시도 API 실행 전에는 `003_workout_retries.sql`도 적용하세요.
기존 일지는 `version=1`로 유지되고, 수정할 때 버전이 증가합니다. 마이그레이션은 재실행해도 안전합니다.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/003_workout_retries.sql
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
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/006_set_completion_rpe.sql
```

휴식 타이머는 서버에 저장하지 않습니다. 이 브라우저의 localStorage(`workout-memo:rest-timer:v1`)에 시간 설정·자동 시작 여부·종료 시각만 보관하며, 남은 시간은 종료 시각으로 다시 계산합니다.

중량은 kg 단위 총중량(머신 기본중량 포함), 반복 수는 양의 정수입니다. 기본중량 미확인은 NULL로 유지합니다. 일지 삭제 시 세트는 CASCADE 삭제됩니다. 목표 달성은 같은 운동명의 완료한 한 세트가 설정 기간 내 중량·횟수를 모두 충족한 경우입니다.

백업은 우산 저장소 `scripts/backup.ps1`, 복원은 아래 명령으로 수행합니다. 복원 대상은 비어 있는 별도 데이터베이스로 준비하세요.

```powershell
docker compose exec -T db createdb -U workout workout_restore
docker compose cp backups/FILE.sql db:/tmp/restore.sql
docker compose exec -T db psql -U workout -d workout_restore -v ON_ERROR_STOP=1 -f /tmp/restore.sql
docker compose exec -T db rm -f /tmp/restore.sql
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
