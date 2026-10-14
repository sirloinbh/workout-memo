# #4 개발 기준 고정

- 이슈: https://github.com/sirloinbh/workout-memo/issues/4
- 상위 로드맵: https://github.com/sirloinbh/workout-memo/issues/3
- 브랜치: chore/4-development-baseline

## 작업 커밋: chore: 개발 실행 환경과 검사 기준 고정 (#4)

Node.js·npm, 설치·잠금 파일, 포맷·정적 검사·타입 검사·테스트·빌드 명령을 고정한다. CI와 Docker가 같은 기준을 사용하도록 맞추고 기존 코드의 포맷 및 검사 오류를 정리한다.

## 변경 내용

- Node.js 24.21.0·npm 11.19.0, engines·packageManager·버전 선택 파일과 engine-strict를 도입했다. 시스템 Node 설치는 변경하지 않았다.
- 지원 중인 ESLint 10·typescript-eslint·React Hooks 규칙, Prettier, EditorConfig, 줄바꿈 정책을 구성했다.
- npm run check에 포맷·lint·프론트/백엔드/테스트 타입·테스트·빌드를 연결했다.
- npm ci 기반 개별 잠금 파일, 고정 버전 Docker 빌드와 CI를 추가했다. npm의 esbuild 설치 스크립트 허용은 루트 및 독립 빌드 대상에서 관리한다. npm workspaces에서는 하위 allowScripts를 무시하고 루트 정책을 사용한다.
- 기존 소스는 한 번 포맷했다. 기능 수정은 unused import 제거, React effect 의존성 안정화, 오류 경계의 unknown 처리와 테스트 콜백 타입 정리에 한정했다.
- Node 런타임에 맞춰 백엔드 Node 타입을 24 계열로 맞췄다.

## 검증

- 공식 배포 SHA-256으로 검증한 임시 Node 24.21.0·npm 11.19.0 환경에서 npm ci 성공.
- npm run check: 포맷·lint·타입·테스트 4개(전용 PostgreSQL 통합 테스트 포함, skip 0)·프론트/백엔드 빌드 통과.
- 기존 사용자 DB와 분리한 workout_test_4 데이터베이스를 만들어 스키마를 적용하고 테스트했다.
- 프론트엔드·백엔드 Docker 이미지 빌드 통과. Node 타입 갱신 이후 최종 npm run check도 통과했다.
- npm run format 재실행 시 모든 대상 파일 unchanged. git diff --check도 통과했다.
- 화면 기능을 추가하지 않아 브라우저 조작 검증은 수행하지 않았다. Playwright 도입은 후속 단계다.

## 범위

API 계약·디자인·상태 관리·추가 테스트 도구·AWS 배포는 상위 로드맵의 후속 단계다. PR 병합은 사용자가 수행한다.
