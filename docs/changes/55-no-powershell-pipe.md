# #55 PowerShell 파이프 마이그레이션·백업의 한글 손상 방지

- 이슈: [#55](https://github.com/sirloinbh/workout-memo/issues/55)
- 브랜치: `fix/55-no-powershell-pipe`

## 문제

Windows PowerShell 5.1은 외부 프로그램과 파이프로 텍스트를 주고받을 때 인코딩을 바꾼다.

- **보낼 때**: `$OutputEncoding`(기본 ASCII)으로 변환한다. `database/README.md`의 `Get-Content … | docker compose exec … psql` 안내대로 001을 적용하면 `'기타'`가 `'??'` 브랜드로 추가된다(2026-10-19 재현).
- **받을 때**: 콘솔 코드 페이지(한국어 Windows 기본 CP949)로 해석한다. 이번에 추가로 발견했다. `scripts/backup.ps1`은 `pg_dump` 출력을 변수로 받으므로, CP949 콘솔에서는 `기타`가 `湲고?`로 깨진 채 백업 파일에 저장된다. 테스트 DB로 재현했다(UTF-8 콘솔에서는 정상이라 지금까지 드러나지 않았다).

## 변경 — 2026-10-20

- `scripts/backup.ps1`
  - `pg_dump -f /tmp/workout-backup.sql`로 컨테이너 안에 쓴 뒤 `docker compose cp`로 바이트 그대로 꺼낸다. 임시 파일은 `finally`에서 지운다.
  - 스크립트는 ASCII로 유지한다. PowerShell 5.1은 BOM 없는 `.ps1`을 ANSI로 읽기 때문이다.
- `database/README.md`
  - 파일별 마이그레이션 명령 6개를 compose가 마운트한 파일을 실행하는 방식(`psql -f /docker-entrypoint-initdb.d/<파일>`)으로 바꿨다.
  - 백업 복원은 `createdb` → `docker compose cp` → `psql -f` → 임시 파일 삭제 순서로 바꿨다.
  - "PowerShell 파이프를 쓰지 않는 이유" 절을 추가했다. 원인, 권장 방식(`npm run db:migrate`, `backup.ps1`), 깨진 행 조회(brands, official_machine_weights의 `?` 포함 행, 조회만 함)를 담았다.
- `scripts/test/docs-commands.test.mjs`(신규)와 `npm run test:docs`(`npm run check`에 포함)
  - 저장소 Markdown의 `powershell`·`ps1`·`pwsh` 코드 블록에서 `| docker`, `| psql`, `| pg_restore`, `Get-Content … | docker/psql` 패턴을 찾는다. 과거 기록인 `docs/changes`, `docs/daily`는 제외한다.
  - 판정 함수 자체도 시험한다: 옛 패턴은 잡고, `-f`·`cp`, PowerShell 내부 파이프(`| Select-Object`), bash 블록은 허용한다.
  - `backup.ps1`이 변수로 받지 않고 `-f`와 `cp`를 쓰는지, ASCII인지 검사한다.

## 검증

| 검사                                                                       | 결과                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CP949 콘솔에서 옛 방식 재현(테스트 DB)                                     | `기타` → `湲고?`                                                                                                                    |
| CP949 콘솔에서 새 `backup.ps1` 실행(로컬 DB를 읽기만 함, 시험 파일은 삭제) | 덤프에 `기타` 보존, `湲고` 없음                                                                                                     |
| 별도 compose 프로젝트에서 README 명령 실행                                 | 001·009 `-f` 재적용 후 중복 없음(브랜드 5개, `기타` 포함), 깨진 행 조회 0건, `cp`→`-f` 복원 후 `기타`와 한글 공식 참고 행 39개 보존 |
| `npm run test:docs`                                                        | 3 pass. 고치기 전 README로 되돌리면 1 fail(회귀 감지 확인)                                                                          |
| 사용자 로컬 DB 깨진 행 조회(읽기만)                                        | brands 0건. `official_machine_weights` 테이블은 없음(009 미적용, `npm run db:migrate` 필요)                                         |

`npm run check`(`test:docs` 포함): **EXIT=0**. 결과: 백엔드 279, 프론트 89, 워커 212, 스킬 4, 문서 3 모두 pass, fail·skip 0.

## 경계

- 운영·로컬 DB의 데이터를 바꾸거나 지우지 않았다.
- 서버의 `deploy/`·`docs/deployment.md`에 있는 bash 파이프는 Linux bash라 영향이 없다. 검사 대상에서도 제외된다(bash 블록).
