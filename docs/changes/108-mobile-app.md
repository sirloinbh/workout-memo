# #108 모바일 앱 방식 결정과 Play 스토어 요건 조사

- 이슈: [#108](https://github.com/sirloinbh/workout-memo/issues/108)
- 브랜치: `docs/108-mobile-app`
- 결과 문서: [mobile-app.md](../mobile-app.md)

## 목적

웹 앱을 휴대폰 앱으로 쓰고 Play 스토어에 올릴 방식(PWA만·TWA·Capacitor)을 정하고, 후속 이슈 #109·#110·#111의 범위를 정할 근거를 남깁니다. 코드와 의존성은 바꾸지 않았습니다.

## 조사한 것

- 세 방식의 선행 조건(HTTPS, Digital Asset Links, 설치 조건), 웹 배포만으로 갱신되는지, 오프라인, 화면 꺼짐 알림·진동, Health Connect, iOS, 비용, 유지보수.
- Play 요건: 등록비, 신규 개인 계정 비공개 테스트 요건, 내부 테스트, 개인정보처리방침, 데이터 보안 양식, 건강 앱 신고, Health Connect 권한 정책, 목표 API 수준, Play App Signing.
- npm 메타데이터(`npm view`, 설치 없음): `@bubblewrap/cli`, `@bubblewrap/core`, `@capacitor/core`·`cli`·`android`·`ios`, `@capacitor/local-notifications`의 버전·게시일·의존성·install 스크립트.
- 이 앱의 현재 PWA 파일(`manifest.webmanifest`, `sw.js`, `offline.html`, `index.html`, `main.tsx`의 등록 코드)과 [배포·운영](../deployment.md).

## 결과 요약

- 추천: PWA 완성 → PWABuilder로 만든 TWA를 Play 내부 테스트 트랙(본인만)에 등록. Capacitor는 Health Connect나 정확한 로컬 알림이 필요할 때로 보류.
- 확인 사실: HTTP+IP에서는 서비스 워커가 등록되지 않음. `@capacitor/*` 8.6.0은 게시 11일이라 14일 규칙상 8.5.3이 후보. 확인하지 못한 항목은 결과 문서의 "확인하지 못한 것"에 적었습니다.
- 출처 확인 날짜: 2026-11-08(Play Console 도움말, developer.android.com, developer.chrome.com, web.dev, capacitorjs.com, developer.apple.com, webkit.org, PWABuilder 문서, npm 레지스트리).

## 검증

- `node_modules/.bin/prettier --write docs/mobile-app.md docs/changes/108-mobile-app.md`
- `npm run test:docs`
- 결과: prettier `--check` 통과, `test:docs` 3 pass
