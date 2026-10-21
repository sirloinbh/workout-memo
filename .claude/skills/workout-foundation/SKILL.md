---
name: workout-foundation
description: Establish or improve the repeatable development foundation of the workout-memo app, covering stack, structure, conventions, API contracts, design, tests, Codex guidance, and deployment. Use for project foundation requests; apply only the requested scope through the workout-implementation issue-to-PR workflow.
---

# Workout Memo 개발 기반

운동 일지 앱의 개발·검증·운영 방식을 반복 가능하게 정리한다. 먼저 프로젝트 루트의 `AGENTS.md`와 `skills/workout-implementation/SKILL.md`를 읽고, 이슈 → 번호 기반 브랜치 → 구현 및 docs 기록 → 테스트·PR → 자동 리뷰(최대 2회) → CI 통과 후 병합 절차로 진행한다. 이 스킬이 이슈·PR·CI 절차를 생략하거나 별도 배포 권한을 부여하지 않는다.

## 범위와 선택

- [기술 추천과 적용 순서](references/stack.md)를 읽고 해당 요청에 필요한 영역만 적용한다.
- 패키지 도입, 영역별 독립 빌드, 화면 리팩터링, 연속 PR, 생성 산출물은 [검증된 반복 절차](references/procedures.md)를 따른다.
- 현재 package.json, 잠금 파일, API·SQL, Compose, CI와 운영 문서를 확인해 실제 구현과 추천을 구분한다. 추천 목록 전체를 자동 설치하거나 앱을 다시 만들지 않는다.
- 사용자는 본인 한 명이며 로그인 기능은 현재 요구사항에 없다. 날짜는 Asia/Seoul 기준, 중량은 기본중량 포함 총중량 kg, 미확인 기본중량은 NULL이다.
- 실행 환경과 의존성 버전은 적용 시점의 공식 지원·호환성을 확인해 선택한다. 기존 잠금 파일과 설치 환경을 함께 갱신하며, 날짜에 따라 달라지는 추천을 영구 고정값처럼 적용하지 않는다.
- 도구 교체가 필요한 경우 실제 문제·데이터 영향·검증 방법을 먼저 정리한다. 기존 코드와 사용자의 선택을 활용한다.

## 수행

1. 현재 상태와 해당 이슈의 완료 기준을 정하고, 선택 이유·구조·계약을 필요한 프로젝트 문서에 기록한다.
2. 도구 설정, 실제 실행 명령, CI와 문서를 같은 변경에서 맞춘다. 사용하지 않는 설정·스크립트·빈 모듈은 만들지 않는다.
3. API·DB 변경은 기존 데이터와 날짜·단위 의미를 보존하고, 마이그레이션 적용과 실패 복구 방법을 검증한다. DB 스키마·마이그레이션의 관리 원본은 하나로 정한다.
4. 화면 변경은 기존 디자인을 유지하면서 공통 컴포넌트·폼·로딩·빈 결과·오류·키보드 접근을 해당 기능 범위에서 정리한다.
5. 프로젝트의 `skills/workout-testing/SKILL.md`를 함께 적용한다. 구현·수정과 관련 테스트 코드를 함께 작성하고 버그에는 회귀 테스트를 추가한다. 커밋 전과 PR 생성·갱신 전에 관련 검사를 실행하며 실제 결과를 docs·PR에 기록한다. 기준 기능인 운동 일지 CRUD의 변경된 동작을 적합한 단위·통합·브라우저 검사로 검증한다.
6. 배포 작업은 사용자 요청 범위에서 수행한다. 이미지 버전, health check, 설정·비밀값 관리, 백업·복원, 이전 버전 복구를 준비한다. 비용이 발생하는 리소스는 배포 목적과 예산에 맞게 선택한다.
7. 각 작업 커밋에 docs 기록을 포함하고 검증한 PR을 생성하고 자동 리뷰(최대 2회)를 거쳐 CI가 통과하면 병합한다.

## 완료 기준

새 환경에서 문서대로 설치·실행·해당 검증을 재현할 수 있고, 선택한 도구가 실제 코드·명령·CI에 반영되어야 한다. 미설치 도구, 건너뛴 검사, 실제로 하지 않은 AWS 배포는 후속 작업으로 명시한다.
