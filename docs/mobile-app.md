# 모바일 앱 방식 결정(PWA·TWA·Capacitor)과 Play 스토어 요건

- 이슈: [#108](https://github.com/sirloinbh/workout-memo/issues/108) (상위 [#215](https://github.com/sirloinbh/workout-memo/issues/215))
- 확인 날짜: 2026-11-08. Play 정책과 npm 버전은 자주 바뀌므로 #110·#111 착수 때 다시 확인한다.
- 이 문서는 조사·결정 기록이다. 빌드 절차와 릴리스 절차는 #110·#111에서 이 문서에 더한다.

## 요약

**추천: PWA를 먼저 완성하고(#106·#107·#109), 스토어에는 PWABuilder 웹 서비스로 만든 TWA를 Play 내부 테스트 트랙(본인만)으로 올린다. Health Connect(#118)나 화면 꺼짐 상태의 정확한 타이머 알림이 꼭 필요해지면 그때 Capacitor로 옮긴다.**

- TWA는 웹 배포만으로 앱 내용이 갱신되고, 로컬에 npm 도구를 설치하지 않아도 된다. 비용은 Play 등록비 US$25(1회)와 도메인 비용뿐이다.
- 세 방식 모두 **공개 HTTPS 도메인(#106)과 로그인(#107)이 먼저**다. 지금의 `http://<IP>`에서는 서비스 워커조차 등록되지 않는다.

## 이 앱의 조건

| 항목             | 현재 상태                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 사용자           | 본인 1명                                                                                                                                                               |
| 접속             | `http://<고정 IP>`, Lightsail 방화벽 IP 허용 리스트로만 제한([배포·운영](deployment.md)). 도메인·HTTPS 없음(#106)                                                      |
| 인증             | 없음(#107). 휴대폰은 IP가 바뀌므로 로그인 없이는 모바일 접속 불가                                                                                                      |
| PWA 파일         | `manifest.webmanifest`(standalone, 192·512·maskable 아이콘), `sw.js`(페이지는 네트워크·오프라인 안내, `/assets/`만 캐시, `/api/` 미관여), `offline.html`, Apple 아이콘 |
| 서비스 워커 등록 | `main.tsx`가 운영 빌드에서 `/sw.js`를 등록하지만, HTTP+IP는 보안 컨텍스트가 아니라 실제로는 등록되지 않는다                                                            |
| 중요한 기능      | 휴식 타이머 종료 알림·진동(화면 꺼짐 포함), 헬스장 오프라인 사용, 앞으로 가민·나이키 데이터(Health Connect, #118)                                                      |

오프라인에 대해: 지금 서비스 워커는 페이지를 캐시하지 않으므로 오프라인이면 `offline.html`만 보인다. "헬스장에서 오프라인 기록"은 방식 선택과 별개로 앱 셸 캐시와 저장 대기열(초안 보존 #34)을 만들어야 하는 웹 쪽 작업이다. 세 방식 모두 같은 웹 코드를 쓰므로 이 작업은 어느 방식에서도 재사용된다.

## 후보 비교

| 기준                  | PWA만                                                                               | TWA (Bubblewrap / PWABuilder)                                                                       | Capacitor                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 실행 방식             | 브라우저가 설치한 웹 앱                                                             | Chrome(또는 TWA 지원 브라우저)이 주소창 없이 띄우는 안드로이드 앱                                   | 앱 안의 WebView + 네이티브 플러그인                                                                                        |
| 선행 조건             | HTTPS, manifest(이름·192/512 아이콘·`start_url`·`display`)                          | PWA 조건 + `/.well-known/assetlinks.json`(Digital Asset Links). 실패하면 주소창이 보이는 Custom Tab | 안드로이드 스튜디오 2025.2.1 이상, Node 22 이상. 웹 자원을 앱에 넣으면 앱 자체는 HTTPS 없이도 뜨지만 API 서버는 HTTPS 필요 |
| 웹 배포만으로 갱신    | 예                                                                                  | 예(내용은 웹에서 불러옴). 아이콘·이름·패키지 설정만 앱 업데이트                                     | 아니오. 웹 자원을 앱에 넣으므로 매번 앱 빌드·스토어 업데이트. `server.url` 원격 로드는 공식 문서상 "운영용 아님"           |
| 오프라인              | 서비스 워커 캐시(웹 작업)                                                           | PWA와 같음(같은 서비스 워커)                                                                        | 앱 셸은 기본 포함. 데이터 오프라인은 역시 직접 구현                                                                        |
| 화면 꺼짐 타이머 알림 | 불안정. 숨은 페이지 타이머는 5분 뒤 1분에 한 번으로 묶임. 예약 알림 API는 개발 중단 | PWA와 같음(웹 코드가 알림을 띄움)                                                                   | Local Notifications로 예약 가능. 정확한 시각은 `SCHEDULE_EXACT_ALARM`, Doze 중엔 `allowWhileIdle`(앱당 9분에 한 번)        |
| 서버 Web Push로 대체  | 가능(서버가 종료 시각에 푸시). VAPID·구독 저장·발송 코드 필요                       | 가능(같은 방식)                                                                                     | 필요 없음(로컬 알림)                                                                                                       |
| Health Connect        | 불가(웹 API 없음)                                                                   | 불가(TWA 안은 웹 코드)                                                                              | 가능. 단 Kotlin 네이티브 코드(Jetpack `connect-client`)를 직접 쓰거나 커뮤니티 플러그인 필요                               |
| iOS                   | 가능. Safari "홈 화면에 추가", iOS 16.4부터 홈 화면 앱 Web Push                     | 없음(안드로이드 전용)                                                                               | 가능. Mac·Xcode 26 이상, Apple Developer Program 연 US$99                                                                  |
| 비용                  | 도메인 비용                                                                         | 도메인 + Play US$25(1회)                                                                            | 도메인 + Play US$25(1회), iOS면 연 US$99와 Mac                                                                             |
| 유지보수              | 가장 적음                                                                           | 적음. 서명 키·`assetlinks.json` 관리, Play 목표 API 수준 갱신 때 재빌드                             | 큼. 안드로이드 프로젝트·Gradle·플러그인 버전, 웹 변경마다 앱 릴리스                                                        |
| npm 공급망            | 새 패키지 없음                                                                      | Bubblewrap CLI는 의존성이 많음. PWABuilder 웹 서비스를 쓰면 로컬 설치 없음                          | `@capacitor/*` 3~4개가 앱 저장소 의존성으로 계속 남음                                                                      |

## 각 후보의 장단점

### PWA만

- 장점: 추가 도구·비용이 없다. 이미 manifest·아이콘·서비스 워커가 있어 HTTPS만 붙으면 설치 조건을 거의 채운다. iOS도 같은 코드로 된다.
- 단점: 스토어 등록이 없다(사용자 요청 3을 다 채우지 못함). 화면이 꺼진 동안 타이머 알림을 기기 안에서 정확히 띄울 방법이 없다. Health Connect를 쓸 수 없다.

### TWA

- 장점: PWA를 그대로 스토어 앱으로 만든다. 웹 배포가 곧 앱 갱신이라 지금의 자동 배포(#75)를 그대로 쓴다. PWABuilder 웹 서비스로 AAB·서명 키·`assetlinks.json`까지 받을 수 있다.
- 단점: 알림·Health Connect 한계는 PWA와 같다. Digital Asset Links 검증이 실패하면 주소창이 보인다. 서명 키 지문을 Play App Signing 키 지문으로 바꿔 `assetlinks.json`에 넣어야 한다. 기기의 Chrome에 의존한다.

### Capacitor

- 장점: 로컬 예약 알림·진동, Health Connect(네이티브 코드), iOS까지 한 코드로 확장할 수 있다.
- 단점: 웹 배포만으로는 앱이 갱신되지 않는다(1인 앱에 매 배포 스토어 릴리스는 부담). 안드로이드 스튜디오·Gradle 유지, 플러그인 버전 추적이 필요하다. Health Connect는 Capacitor 공식 플러그인을 확인하지 못해 Kotlin을 직접 쓰거나 커뮤니티 플러그인을 검토해야 한다(아래 "확인하지 못한 것").

## Play 스토어 요건 (2026-11-08 확인)

| 요건                       | 내용                                                                                                                                                                            | 출처                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 등록비                     | **US$25, 1회**. 신분증·법적 이름의 신용카드를 요구할 수 있음. 개인 계정은 Play Console 앱으로 안드로이드 기기 접근 인증 필요                                                    | [6112435](https://support.google.com/googleplay/android-developer/answer/6112435)                                                                                                              |
| 신규 개인 계정 테스트 요건 | 2023-11-13 이후 만든 개인 계정은 프로덕션 전 **비공개 테스트에 테스터 12명이 14일 연속** 참여해야 함. 중간에 나갔다 들어오면 다시 셈                                            | [14151465](https://support.google.com/googleplay/android-developer/answer/14151465)                                                                                                            |
| 내부 테스트                | 요건 없음, 테스터 **최대 100명**, 표준 정책·보안 검토를 받지 않을 수 있고 몇 분 안에 배포. 프로덕션 없이 내부 테스트만 운영 가능                                                | [14151465](https://support.google.com/googleplay/android-developer/answer/14151465), [9845334](https://support.google.com/googleplay/android-developer/answer/9845334)                         |
| 개인정보처리방침           | **모든 앱 필수**(데이터를 안 모아도). 스토어 등록정보와 앱 안에 링크. 공개적으로 접속되는 URL, 유효한 SSL, 지역 차단·로그인 벽 없음, PDF 불가                                   | [9859455](https://support.google.com/googleplay/android-developer/answer/9859455)                                                                                                              |
| 데이터 보안 양식           | 비공개·공개 테스트·프로덕션 트랙 앱은 필수. **내부 테스트에만 있는 앱은 면제**                                                                                                  | [10787469](https://support.google.com/googleplay/android-developer/answer/10787469)                                                                                                            |
| 건강 앱 신고               | 비공개·공개 테스트·프로덕션 앱은 건강 기능이 없어도 제출. 이 앱은 "Activity and Fitness"에 해당                                                                                 | [14738291](https://support.google.com/googleplay/android-developer/answer/14738291)                                                                                                            |
| Health Connect 권한        | Play Console 신고 양식에 권한별 사유를 적고 검토받음. 허용 용도(피트니스 코칭 등)에 맞아야 하고, 개인정보처리방침에 건강 데이터 처리를 적음. 앱 안에 방침을 보여 주는 화면 필요 | [12991134](https://support.google.com/googleplay/android-developer/answer/12991134), [get-started](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started) |
| 목표 API 수준              | 새 앱·업데이트는 **Android 16(API 36) 이상**(2026-08-31부터, 연장 2026-11-01까지 — 이미 지남)                                                                                   | [11926878](https://support.google.com/googleplay/android-developer/answer/11926878)                                                                                                            |
| 앱 서명                    | 새 앱은 Play App Signing에 자동 등록(Google 생성 키). 업로드 키는 잃어도 재설정 가능, 앱 서명 키는 Google이 보관                                                                | [9842756](https://support.google.com/googleplay/android-developer/answer/9842756)                                                                                                              |

공개 HTTPS 도메인이 꼭 필요한 것

- 개인정보처리방침 URL: 전 세계에서 로그인 없이 열려야 한다. IP 허용 리스트 뒤에 둘 수 없다. 앱 도메인의 공개 페이지(로그인 예외)로 두거나 별도 정적 호스팅에 둔다.
- TWA의 `/.well-known/assetlinks.json`: 도메인 루트에 HTTPS로 둔다. 로그인 없이 열려야 한다.
- PWA 설치 조건의 HTTPS.

Health Connect 메모: Android 14부터 OS에 포함, 13 이하는 Health Connect 앱 설치가 필요하다. 권한 허용 시점보다 30일 이전 기록을 읽으려면 `PERMISSION_READ_HEALTH_DATA_HISTORY`가 따로 필요하다(#118에서 가민 과거 기록을 가져올 때 영향).

## npm 도구와 공급망

`npm view`(메타데이터 읽기만)로 확인했다. 기준일 2026-11-08, 14일 기준선은 2026-10-25 이전 게시.

| 패키지                           | 최신(latest) | 게시일(UTC) | 14일 경과    | 14일 규칙에 맞는 선택                                                     | 메모                                                                                                     |
| -------------------------------- | ------------ | ----------- | ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@bubblewrap/cli`                | 1.27.0       | 2026-10-09  | 예(30일)     | 1.27.0                                                                    | GoogleChromeLabs. `@bubblewrap/core` 1.27.0(2026-10-09)이 googleapis·jimp·resvg 등 끌고 옴. Node 18 이상 |
| `@capacitor/core`                | 8.6.0        | 2026-10-28  | 아니오(11일) | 8.5.3(2026-10-07)                                                         | 의존성 `tslib`만                                                                                         |
| `@capacitor/cli`                 | 8.6.0        | 2026-10-28  | 아니오       | 8.5.3(2026-10-07)                                                         | Node 22 이상, tar·xcode·native-run 등 18개 직접 의존성                                                   |
| `@capacitor/android`             | 8.6.0        | 2026-10-28  | 아니오       | 8.5.3(2026-10-07). 8.6.0은 core ^8.6.0을 요구하므로 세 패키지 버전을 맞춤 | 8.5.3의 peer는 `@capacitor/core ^8.5.0`                                                                  |
| `@capacitor/local-notifications` | 8.3.1        | 2026-08-19  | 예(81일)     | 8.3.1                                                                     | peer `@capacitor/core >=8.0.0`                                                                           |

- 위 패키지의 최상위에는 `preinstall`·`install`·`postinstall` 스크립트가 없다. 하위 의존성은 설치하지 않아 확인하지 못했다.
- 도입하게 되면 AGENTS.project.md와 [검증된 반복 절차](../skills/workout-foundation/references/procedures.md)를 따른다: 사용자 위험 인지 확인 → `npm install --ignore-scripts --save-exact` → `hasInstallScript` 점검 → subtree lockfile을 `--before=<14일 전>`으로 재생성 → Docker 빌드 확인. Capacitor는 앱 저장소 의존성으로 계속 남는다.
- Bubblewrap은 처음 실행 때 JDK와 Android SDK를 내려받는다(공식 README 기준, 이번에 실행해 확인하지는 않음). 쓰게 되면 앱 저장소가 아니라 별도 임시 폴더에 고정 버전으로 설치해 일회성으로 쓴다.

### PWABuilder 웹 서비스로 로컬 설치 없이 만들기

PWABuilder(<https://www.pwabuilder.com>)는 서버에서 Bubblewrap을 돌려 TWA를 만든다.

1. 공개 HTTPS로 배포된 PWA 주소를 넣고 Android 패키지를 고른다(manifest 필요).
2. 패키지 이름(예: `kr.sirloinbh.workoutmemo`)·앱 이름·버전을 넣고, 서명 키는 "New"(새 키 생성)를 고른다.
3. zip을 받는다: `.aab`(Play 업로드용), `assetlinks.json`, `signing.keystore`, `signing-key-info.txt`(키·저장소 비밀번호, 별칭).
4. 첫 업로드 뒤 Play Console의 앱 서명 키 SHA-256 지문을 `assetlinks.json`에 더해 `/.well-known/assetlinks.json`으로 배포한다(Google이 다시 서명하므로).
5. `signing.keystore`와 `signing-key-info.txt`는 저장소에 커밋하지 않고 비밀번호 관리자 등 오프라인에 보관한다(업로드 키는 잃어도 재설정 가능).

위험: 업로드 키가 제3자 서비스에서 만들어진다. 대신 Play App Signing이 실제 앱 서명 키를 보관하고 업로드 키는 재설정할 수 있어 영향이 제한된다. 꺼림칙하면 Mine 옵션으로 직접 만든 키(`keytool`, JDK 포함)를 쓴다. 출처: [PWABuilder Android 문서](https://docs.pwabuilder.com/#/builder/android).

## 추천과 이유

**TWA(PWABuilder) + Play 내부 테스트 트랙**, 기반은 PWA.

1. 1인 앱이고 자동 배포(#75)가 있으므로, 웹 배포만으로 앱이 갱신되는 방식이 운영 부담이 가장 적다(PWA·TWA).
2. 스토어 등록 요청은 TWA로 채운다. 내부 테스트는 테스터 12명·14일 요건, 데이터 보안 양식, 건강 앱 신고가 필요 없다.
3. npm 도구를 로컬에 들이지 않아도 된다(PWABuilder). 들이더라도 `@bubblewrap/cli` 1.27.0은 14일 규칙을 채운다.
4. 휴식 타이머: 화면이 켜져 있으면 지금처럼 웹에서 처리하고, 화면 꺼짐은 (a) 서버 Web Push로 종료 시각에 알림 또는 (b) Capacitor 로컬 알림 중 고른다. (a)는 같은 웹 코드로 PWA·TWA·iOS 홈 화면 앱에 모두 쓸 수 있다.

탈락·보류 이유

- **PWA만**: 스토어 등록이 없다. 다만 TWA의 기반이므로 버리는 것이 아니라 먼저 완성한다.
- **Capacitor(보류)**: 웹 배포만으로 갱신되지 않고 안드로이드 프로젝트 유지와 npm 의존성이 계속 든다. Health Connect도 공식 플러그인을 확인하지 못해 Kotlin 작업이 필요할 수 있다. #118에서 Health Connect 경로를 고르거나, 서버 Web Push로도 화면 꺼짐 알림이 부족할 때 다시 연다. TWA에서 옮겨도 웹 코드와 패키지 이름·Play 등록정보는 재사용한다(같은 패키지 이름으로 앱 업데이트).

## 선행 순서

```text
#106 도메인·HTTPS ──┬─> #107 로그인(Secure 쿠키) ──┐
                    └─> #109 PWA 설치 검증 ───────┴─> #110 TWA 패키지·서명·실기기 ─> #111 Play 등록(내부 테스트)
(#118 Health Connect 결정) ─ 필요 시 ─> Capacitor 전환 이슈(새로 만듦)
```

- #106이 모든 것의 시작이다. 서비스 워커·설치·`assetlinks.json`·개인정보처리방침 URL이 모두 HTTPS를 요구한다.
- #107은 휴대폰 접속(바뀌는 IP)과 방화벽 443 공개의 전제다. 공개 경로(`/.well-known/assetlinks.json`, 개인정보처리방침 페이지)는 로그인 예외로 둔다.
- #109는 #106 뒤에 바로 할 수 있다. #107과 병행 가능하다.
- #110은 #106·#107·#109가 끝나야 실기기 시나리오(로그인 유지 등)를 검증할 수 있다.
- #111은 #110의 AAB와 개인정보처리방침 페이지가 있어야 한다. Play 계정 생성·결제는 사용자가 한다.

## 사용자 결정 항목

1. **스토어 공개 대상**: 본인만 내부 테스트(추천, 테스터 요건 없음) / 일반 공개(테스터 12명·14일 비공개 테스트, 데이터 보안 양식, 건강 앱 신고, 심사 필요).
2. **iOS 필요 여부**: 필요 없음(추천) / iOS 홈 화면 PWA로 충분 / App Store 등록(Mac·Xcode·연 US$99, Capacitor 필요).
3. **화면 꺼짐 알림 수준**: 화면 켜짐에서만 알림 / 서버 Web Push로 종료 알림(추천, 수 초 지연 가능) / 로컬 정확 알림(Capacitor).
4. **Health Connect 시점**: #118 결론 후 결정(추천) / 지금부터 Capacitor로 시작.
5. **비용**: 도메인 연 비용(#106) + Play US$25(1회). iOS 스토어면 연 US$99 추가.
6. **빌드 도구**: PWABuilder 웹 서비스(추천, 로컬 설치 없음, 업로드 키를 서비스가 생성) / `@bubblewrap/cli@1.27.0` 로컬 설치(npm 위험 인지 확인 필요) / 직접 만든 키 + PWABuilder "Mine".

## 후속 이슈 범위 제안

- **#109 PWA 설치 지원**: 이슈 본문의 "manifest·아이콘·서비스 워커 없음"은 이미 해소됐다(중앙 템플릿 동기화). 남은 범위는 HTTPS에서 Chrome 설치 가능 판정과 Lighthouse 기록, 안드로이드 실기기 설치·전체 화면, 새 버전 반영 확인, 오프라인 앱 셸 캐시와 저장 실패 표시(#34 연결) 여부 결정, 서버 Web Push 휴식 알림을 여기서 할지 별도 이슈로 뺄지 결정. `vite-plugin-pwa`는 쓰지 않고 현재 직접 작성한 `sw.js`를 유지한다(새 npm 없음).
- **#110 안드로이드 패키지**: TWA(PWABuilder)로 확정. 패키지 이름, 업로드 키 생성·보관, `/.well-known/assetlinks.json` 배포(로그인 예외, 업로드 키·앱 서명 키 지문 둘 다), 목표 API 36 이상 확인, 실기기 시나리오(로그인 유지·일지 저장·휴식 타이머·뒤로 가기·웹 배포 반영). APK 직접 설치 대신 Play 내부 테스트로 설치한다.
- **#111 Play 등록**: 내부 테스트 트랙까지로 범위를 줄이는 것을 제안한다. 계정 등록(US$25, 기기 인증), 개인정보처리방침 공개 페이지, 스토어 등록정보 최소본. 일반 공개를 고르면 비공개 테스트(12명·14일), 데이터 보안 양식, 건강 앱 신고("Activity and Fitness"), 콘텐츠 등급을 더한다.
- **새 이슈(보류)**: 화면 꺼짐 휴식 알림(서버 Web Push), Capacitor 전환과 Health Connect 연동(#118 결과에 따라).

## 확인하지 못한 것

- 내부 테스트 트랙만 쓸 때 Play Console이 개인정보처리방침·콘텐츠 등급 등 "앱 콘텐츠" 항목 입력을 첫 배포 전에 요구하는지. 데이터 보안 양식 면제만 공식 문서로 확인했다. 건강 앱 신고 페이지는 대상 트랙으로 비공개·공개·프로덕션만 들어 내부 테스트는 빠진다고 보이지만 명시 문구는 없다.
- TWA 안의 웹 알림이 앱 알림으로 넘겨지는 동작(알림 위임)과 Android 13 알림 권한 처리. 관련 Chrome 문서 주소가 404였다.
- 서버 Web Push가 화면 꺼짐·Doze 상태에서 도착하는 지연과, `showNotification`의 `vibrate` 옵션이 Android 8 이상 알림 채널에서 실제로 진동하는지. 실기기 검증(#110)에서 확인한다.
- Health Connect용 Capacitor 커뮤니티 플러그인의 존재·유지 상태와 버전, 공식 플러그인 유무(이번에 확인하지 않음).
- Bubblewrap의 JDK·Android SDK 자동 다운로드와 하위 의존성 수(설치하지 않음).
- Digital Asset Links 검증이 기기에서 직접 파일을 받는지 Google 서버를 거치는지. 어느 쪽이든 `/.well-known/assetlinks.json`을 IP 제한 없이 공개하면 문제가 없다.
- Google의 안드로이드 개발자 인증(Play 밖 APK 설치에도 개발자 신원 확인) 적용 국가·시점. Play 내부 테스트로 설치하면 영향이 없을 것으로 보지만 확인하지 않았다.

## 근거 링크

- Google Play
  - [개발자 계정 등록](https://support.google.com/googleplay/android-developer/answer/6112435)
  - [신규 개인 계정 앱 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
  - [내부·비공개·공개 테스트 설정](https://support.google.com/googleplay/android-developer/answer/9845334)
  - [개인정보처리방침과 앱 콘텐츠](https://support.google.com/googleplay/android-developer/answer/9859455)
  - [데이터 보안 양식](https://support.google.com/googleplay/android-developer/answer/10787469)
  - [건강 앱 신고](https://support.google.com/googleplay/android-developer/answer/14738291)
  - [Health Connect 권한 정책](https://support.google.com/googleplay/android-developer/answer/12991134)
  - [목표 API 수준 요건](https://support.google.com/googleplay/android-developer/answer/11926878)
  - [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- Android·Chrome·웹
  - [Health Connect 시작하기](https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started)
  - [Trusted Web Activity 개요](https://developer.chrome.com/docs/android/trusted-web-activity/overview)
  - [TWA 통합 가이드(assetlinks.json)](https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide)
  - [Chrome 88 타이머 제한(숨은 페이지 5분 뒤 1분에 한 번)](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)
  - [Notification Triggers API 개발 중단](https://developer.chrome.com/docs/web-platform/notification-triggers)
  - [PWA 설치 조건](https://web.dev/articles/install-criteria)
- Capacitor
  - [환경 설정(Node 22, 안드로이드 스튜디오 2025.2.1, Xcode 26)](https://capacitorjs.com/docs/getting-started/environment-setup)
  - [설정 `server.url`(운영용 아님)](https://capacitorjs.com/docs/config)
  - [Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- Apple
  - [Apple Developer Program(연 US$99)](https://developer.apple.com/programs/)
  - [멤버십 비교(무료 계정 제한)](https://developer.apple.com/support/compare-memberships/)
  - [iOS 16.4 홈 화면 웹 앱 Web Push(WebKit)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- PWABuilder·npm
  - [PWABuilder Android 패키지](https://docs.pwabuilder.com/#/builder/android)
  - [@bubblewrap/cli](https://www.npmjs.com/package/@bubblewrap/cli), [@capacitor/core](https://www.npmjs.com/package/@capacitor/core), [@capacitor/cli](https://www.npmjs.com/package/@capacitor/cli), [@capacitor/android](https://www.npmjs.com/package/@capacitor/android), [@capacitor/local-notifications](https://www.npmjs.com/package/@capacitor/local-notifications)
