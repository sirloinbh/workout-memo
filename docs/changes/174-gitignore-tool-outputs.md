# #174 .gitignore에 테스트 산출물과 개인 설정 파일 추가하기

- 이슈: [#174](https://github.com/sirloinbh/workout-memo/issues/174) (중앙 sirloinbh/project-standards#323)

## 변경

`.gitignore`의 `# --- project ---` 절에 아래 항목을 추가했다. 공통 부분은 중앙 관리 파일이라 건드리지 않았고, 중앙 템플릿 반영은 project-standards#323에서 다룬다.

| 항목 | 이유 |
|---|---|
| `blob-report/` | Playwright blob 리포터 결과 |
| `coverage/` | Vitest coverage 결과 |
| `*.tsbuildinfo` | TypeScript 증분 빌드 캐시 |
| `*.tfvars` | Terraform 변수 파일. 비밀값이 들어갈 수 있다. `infrastructure/`를 #141에서 리포 밖으로 옮긴 뒤 로컬에 남은 `infrastructure/terraform.tfvars`가 추적 후보로 보이고 있었다 |
| `.claude/settings.local.json` | 개인 Claude Code 권한 설정. 공유 설정 `.claude/settings.json`은 계속 추적한다 |

## 검증

- `git check-ignore -v --no-index`: 새 항목 경로(`infrastructure/terraform.tfvars`, `blob-report/x`, `coverage/index.html`, `frontend/tsconfig.tsbuildinfo`, `.claude/settings.local.json`)가 모두 새 규칙으로 무시된다. 기존 `.bkit/`, `.playwright-mcp/`, `test-results/`도 무시된다.
- `.claude/settings.json`, `.env.example`은 무시되지 않는다(`git check-ignore` 종료 코드 1).
- `git ls-files`로 새 패턴에 걸리는 추적 파일이 없음을 확인했다.
- `npm run standards:check`(로컬): `.gitignore` 차이는 없다. 공유 패키지 4개(`@sirloinbh/*`)가 로컬 `node_modules`에 설치되지 않아 실패했다. 설치(`npm ci`)는 글로벌 규칙상 하지 않았고, 전체 검사는 PR CI 결과로 확인한다.
- `npm run format:check`(로컬): 같은 이유(`@sirloinbh/prettier-config` 미설치)로 실행하지 못했다. CI 결과로 확인한다.
- 앱 코드 변경이 없어 `npm run check`는 실행하지 않았다.

## 후속

- project-standards#323이 병합되면 동기화 PR로 공통 부분에 같은 항목이 들어온다. 그때 project 절의 중복 항목을 지운다.
