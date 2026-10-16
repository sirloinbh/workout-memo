# 피트니스 서비스 조사 문서와 추가 구현 백로그

- 이슈: [#30](https://github.com/sirloinbh/workout-memo/issues/30)
- 브랜치: docs/30-fitness-app-research
- 기준일: 2026-10-15 (Asia/Seoul)

## 변경 목적과 내용

대화에서 조사한 13개 서비스의 공식 기능·가격·플랫폼·웹 지원, 11개 기능 분야의 확인 서비스 수, 기본 기능·차별화·2025~2026년 흐름·리뷰 불만을 docs/fitness-app-research-2026.md에 보관했다. 미확인 항목, 앱스토어 상품 가격의 한계, Google Fit 전환, JEFIT 출시 범위의 자료 차이를 명시했다. README에 진입 링크를 추가했다.

기존 #17/#27/#28/#29와 중복되지 않도록 추가 카드 #31~#35를 등록하고 완료 기준·의존성·검증 방법을 기록했다. 추가 기능 구현·워커 큐 등록은 하지 않았다. 후순위 기능은 별도 검토 목록으로 남겼다.

## 검증

- 기존 Node 24.21.0과 Prettier로 변경한 Markdown 3개에 `prettier --check` 실행: 3개 통과.
- 임시 Python 검사로 변경 문서의 링크 참조 정의·상대 경로, 13개 서비스, 기능 29행의 서비스 수/분모, #30~#35 연결을 확인: 통과(링크 대상/참조 79개). 외부 URL 응답 상태를 새로 검사한 결과는 아니다.
- `quick_validate.py`를 workout-foundation / workout-implementation / workout-testing에 실행: 3개 통과. 최초 기본 Python 실행은 PyYAML 누락으로 실패했으며, 기존 ignored `.local/skill-validator`를 PYTHONPATH로 지정하고 UTF-8 모드로 재실행해 통과했다. 스킬 파일 변경은 없다.
- `git diff --check` 및 staged diff 검사: Markdown 줄바꿈용 말미 공백을 발견해 빈 줄로 수정한 뒤 재검사 통과.
- 개인 계정 sirloinbh와 저장소 원격을 확인하고 새 이슈 #30~#35의 번호·제목·URL을 재조회했다.
- 이번 변경은 Markdown 문서 3개뿐이므로 앱/DB 테스트·npm run check는 로컬에서 생략했다. 구현 기능 검증 완료로 보고하지 않는다. PR의 GitHub Actions는 별도 결과로 확인한다.

## 제한과 후속 작업

서비스 실제 로그인·결제·기기 연동 검증은 하지 않았다. 경쟁 기능 빈도는 확인한 최소 수이며 시장 통계가 아니다. 이번 문서화에서는 기존 조사 결과를 재사용했고 외부 요금·기능을 새로 재조회하지 않았다. 앱 기능의 구현과 검증은 해당 카드 착수 시 진행하며 PR은 사용자만 병합한다.
