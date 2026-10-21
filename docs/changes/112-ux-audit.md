# #112 모바일 UI/UX 과업 테스트와 개선점 도출

- 이슈: [#112](https://github.com/sirloinbh/workout-memo/issues/112)
- 브랜치: `research/112-ux-audit`
- 종합 카드: [#122](https://github.com/sirloinbh/workout-memo/issues/122)의 확정 작업 순서 1번

## 목적

UI 교체(#98~#105)에 앞서 현재 화면의 문제를 측정하고, 개선점을 우선순위와 함께 후속 이슈에 연결한다.

## 변경 — 2026-10-21

- `docs/ux-audit/2026-10-21.md`(신규): 점검 방법, 페이지별 측정, 6개 과업 시나리오 결과, 개선점 U-01~U-16(심각도·근거·개선안·연결 이슈), 다시 측정 절차
- `docs/ux-audit/2026-10-21/*.png`(신규): 390px 스크린샷 9장, 1280px 1장. 점검용 테스트 DB의 시드 데이터만 보인다.
- 기존 이슈에 없던 개선점은 새 이슈로 등록했다.
  - [#123](https://github.com/sirloinbh/workout-memo/issues/123) 신체 기록 기본 기간 1주로 빈 그래프 표시(bug)
  - [#124](https://github.com/sirloinbh/workout-memo/issues/124) 운동명 자동완성
  - [#125](https://github.com/sirloinbh/workout-memo/issues/125) 종목 분석 모바일 정보 구조
- 앱 코드·테스트 코드는 바꾸지 않았다. 문서와 이미지만 추가했다.

## 검증

- 점검 환경
  - 로컬 전용 테스트 DB 컨테이너에 점검용 DB를 새로 만들었다.
  - `npm run db:migrate`로 001~014를 적용했다.
  - API 3101·Vite 5174를 띄우고 Playwright(설치된 Chrome)로 측정했다. 개인 DB는 사용하지 않았다.
- 문서 검사(Node 24.21.0)
  - `npm run format:check`: 통과
  - `npm run test:docs`: 3 pass, 0 fail
- 실행하지 못한 것
  - 실제 휴대폰 테스트: 사용자 기기가 필요하다.
  - Lighthouse 모바일: DevTools MCP 실행이 30분 무응답으로 중단됐다.
  - 둘 다 점검 문서의 '다시 측정' 절차로 이어서 한다.
- 앱 동작 변경이 없어 앱 테스트는 추가하지 않았다.

## 제한·후속

- 시드 데이터는 4주·운동 9종 규모다. 기록이 수백 개면 목록·분석 길이 문제는 더 커진다.
- 반영 순서: #98(기준) → #105(일지 입력), #123은 독립적으로 먼저 고칠 수 있다.
