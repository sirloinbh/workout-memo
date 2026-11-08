# 외부 러닝 기록 가져오기 경로 조사 (#118)

조사일: 2026-11-08. 대상: 가민(Garmin Connect), 나이키 런 클럽(NRC), Strava 중계, Android Health Connect.
이 앱은 한 사람이 쓰는 개인 웹 앱(IP 허용 목록 뒤 Lightsail 서버)이고, 유산소 기록은 요약값만 저장합니다(#114 `cardio_sessions`, 랩·GPS 없음).

**추천 요약:** ① 파일 가져오기(#119)를 먼저 만듭니다. TCX·GPX는 브라우저 `DOMParser`로 새 패키지 없이 읽고, FIT는 사용자 결정에 따릅니다. ② 가민 자동 동기화(#121)는 2026년에 공개된 **Garmin Personal API**로 진행할 수 있습니다. 신청·승인 없이 본인 키로 본인 데이터만 읽는 공식 경로입니다. 다만 엔드포인트·요청 한도·과거 범위를 Swagger 문서로 먼저 확인합니다. ③ NRC(#120)는 공식 API가 없습니다. 본인 데이터 요청 파일의 형식을 확인하기 전까지 보류하고, 자동 경로가 꼭 필요하면 NRC→Strava 공식 연동 뒤 Strava API(1인 모드)로 읽습니다. ④ Health Connect는 안드로이드 앱이 따로 필요해 가민 Personal API로 충분하면 쓰지 않습니다.

"확인 못 함"은 이번 조사에서 공식 출처로 확인하지 못한 내용입니다. 구현 전에 다시 확인합니다.

## 1. 가민

### 1.1 공식 API 등급

- Garmin Connect Developer Program은 Personal, Business(Starter), Enterprise 등급이 있습니다. Business는 Garmin이 보내 주는 push 방식, Enterprise는 push·ping/pull과 1개월 넘는 과거 기록을 지원합니다. 가격은 공개 페이지에 없습니다(확인 못 함). — [overview](https://developer.garmin.com/gc-developer-program/overview)
- Business 등급(Activity API)은 요약 JSON 또는 FIT를 주고 상세는 FIT·GPX·TCX로 받습니다. — [activity-api](https://developer.garmin.com/gc-developer-program/enterprise/activity-api)
- 2026년 봄부터 Business 신규 신청이 멈췄고, 2026년 10월 약관 변경으로 Garmin이 승인하지 않은 서비스에 데이터를 넘기는 것이 금지됐다는 보도가 있습니다(2차 출처). — [the5krunner 9월](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/), [the5krunner 10월](https://the5krunner.com/2026/10/14/garmin-api-intervals-third-party-apps/)

### 1.2 Personal API (이 앱에 맞는 경로)

- 고객이 자기 Garmin Connect 데이터를 API로 읽는 기능입니다: "allows Garmin customers to securely access their own Garmin Connect data using an API". 여러 사용자를 대상으로 한 상업용 앱은 대상이 아닙니다: "not intended for commercial applications serving multiple end users". — [personal-faq](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- 키 발급은 셀프 서비스입니다. Garmin Connect 웹의 Personal API Key 화면에서 만들고 약관에 동의하며, 키는 만들 때 한 번만 보입니다. 만료는 30·90·180일·1년 중에서 고르고, 만료 약 1주 전에 메일이 옵니다. — [personal-api](https://developer.garmin.com/gc-developer-program/personal/personal-api), [personal-faq](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- 인증: 키로 `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`(헤더 `Authorization: ApiKey …`)을 호출해 OAuth2 access token을 받습니다. 토큰은 24시간(또는 키 만료 중 먼저 오는 때)까지 유효하고 refresh token은 없어 다시 발급받습니다. — 같은 FAQ
- 확인 못 함: 엔드포인트 목록, 받는 형식(요약 JSON·FIT), 요청 한도, 과거 기록 범위, 비용. FAQ가 안내하는 [Swagger 문서](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)에서 확인해야 합니다. API로 받는 FIT가 원본과 같은지도 공개되지 않았다는 보도가 있습니다([the5krunner](https://the5krunner.com/2026/10/22/garmin-personal-api/)).
- 이 앱에 적용할 때: 키는 사용자가 만들어 서버 환경 변수(또는 서버 비밀 저장소)에 두고 커밋하지 않습니다. 토큰은 24시간마다 다시 받고, 서버 작업이 정해진 주기(아래 "공통" 절)로 최근 활동을 읽어 `source='garmin'`, `external_id=활동 ID`로 저장합니다(#114의 출처·외부 ID 중복 방지 그대로). 키 만료(최대 1년) 전에 다시 만들어야 합니다.

### 1.3 사용자가 직접 내보내기

- 활동 1개: 활동 화면 메뉴에서 원본(FIT, zip), TCX, GPX를 받습니다. 공식 도움말은 확인 못 했고 근거는 커뮤니티 글입니다. — [Garmin 포럼](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/166824/)
- 계정 전체: [데이터 요청](https://support.garmin.com/customerDataRequestApp/en-US/initiateRequest/)을 하면 메일로 zip 링크가 오고, 활동은 `DI_CONNECT/DI-Connect-Fitness-Uploaded-Files`에 원본 형식으로 들어 있다고 합니다. 경로와 대기 시간(몇 시간~48시간)은 포럼 보고라 확인 못 함. — [Garmin 포럼](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/407936/export-data)

### 1.4 비공식 라이브러리는 쓰지 않음

- `garminconnect`·`garth` 같은 라이브러리는 공개되지 않은 웹 엔드포인트를 씁니다. 개발자 약관은 robot·spider·scraping 수집을 금지하고([Developer Program Agreement](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf)), 브라우저가 아닌 클라이언트가 막힌다는 보고도 있습니다([Garmin 포럼](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/433892/)). Personal API가 생겨 쓸 이유가 없습니다.

## 2. 나이키 런 클럽

- 공개 API가 없습니다. 2016년에 닫혔다는 2차 보도만 있고 Nike 공식 공지는 확인 못 함. — [Smashrun 블로그](https://blog.smashrun.com/2016/09/29/nike-api-issues/)
- 본인 데이터 요청: 계정 설정 > Privacy의 "Request Data" 또는 웹폼. — [Nike 개인정보 도움말](https://www.nike.com/help/privacy). 받는 형식·걸리는 시간·내용은 제3자 안내뿐이라 확인 못 함([takeoutday](https://takeoutday.org/guides/how-to-export-nike-run-club-data)). **사용자가 한 번 요청해 실제 파일을 보면 #120 범위를 정할 수 있습니다.**
- 비공식 방법(웹 토큰으로 문서화되지 않은 `api.nike.com` 호출, [예시](https://gist.github.com/niw/858c1ecaef89858893681e46db63db66))은 Nike 이용약관이 승인 없는 자동화·scraping·역공학을 금지해 쓰지 않습니다. — [Nike Terms of Use](https://agreementservice.svs.nike.com/rest/agreement/termsOfUse/en/ZA/default/redirect/true)
- 공식 연동 우회
  - NRC 설정 > Partners에서 Garmin·COROS·Strava 등과 연결합니다. — [Nike 도움말](https://www.nike.com/de/help/a/nrc-partner-apps-und-geraete-verbinden). NRC → Garmin 방향으로 기록이 가는지는 확인 못 함.
  - NRC → Strava 공식 연동(2023년 시작, 연결 뒤 기록한 활동만). — [보도자료](https://insider.fitt.co/press-release/strava-launches-nike-run-club-and-nike-training-club-integration-available-today/), [Nike 뉴스룸](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)
  - NRC → Apple Health 단방향. — [Nike 도움말](https://www.nike.com/help/a/connect-nrc-health-app). NRC → Health Connect는 공식 문서를 확인 못 함.

## 3. Strava 중계

- 앱 등록은 셀프 서비스이고 새 앱은 "Single Player Mode"(사용자 1명, 개발자 본인)로 시작합니다. 호출 한도는 기본 전체 200회/15분·2,000회/일(업로드 외 요청 100회/15분·1,000회/일)입니다. — [rate-limits](https://developers.strava.com/docs/rate-limits/)
- 비공개 활동까지 읽으려면 `activity:read_all` 스코프가 필요합니다. 활동 요약·랩·스트림은 읽지만, 기록된 활동의 원본 파일(FIT)을 내려받는 엔드포인트는 찾지 못했습니다(문서 일부만 확인). — [API reference](https://developers.strava.com/docs/reference/)
- API 약관(2026-06-01 시행): 사용자의 데이터는 그 사용자에게만 보여 주고, 토큰 하나는 앱 하나에만 씁니다. 지금은 무료이고 사전 고지 뒤 유료화될 수 있습니다. — [Strava API Agreement](https://www.strava.com/legal/api)
- 쓸모: NRC 기록을 자동으로 가져올 유일한 공식 경로입니다(NRC→Strava→이 앱). 가민은 Personal API가 더 직접적입니다.

## 4. Android Health Connect

- 데이터는 기기 안에만 있고 Google 클라우드에 올라가지 않습니다. 웹 앱은 읽을 수 없고 Jetpack SDK를 쓰는 안드로이드 앱이 필요합니다. — [Android 도움말](https://support.google.com/android/answer/13770320), [Health Connect 가이드](https://developer.android.com/health-and-fitness/guides/health-connect)
- 관련 데이터: `ExerciseSessionRecord`(운동 종류, segments, laps), `DistanceRecord`, `HeartRateRecord`, `TotalCaloriesBurnedRecord`, `ElevationGainedRecord`, `StepsCadenceRecord`, `CyclingPedalingCadenceRecord` 등. — [data-types](https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types)
- 처음 권한을 받은 때보다 30일 넘게 지난 기록은 `READ_HEALTH_DATA_HISTORY`(`PERMISSION_READ_HEALTH_DATA_HISTORY`) 권한이 있어야 읽습니다. 앱을 다시 설치하면 기준이 초기화됩니다. — [read-data](https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data)
- Garmin → Health Connect 운동 세션 동기화는 2차 출처뿐이고(공식 FAQ는 열리지 않음), NRC도 공식 문서를 확인 못 함. — [Sonar Health](https://www.sonarhealth.co/blog/sync-health-connect-to-garmin/)
- [모바일 앱 결정(#108)](mobile-app.md)은 PWA·TWA를 먼저 하고 Health Connect가 꼭 필요할 때 Capacitor로 옮기는 것입니다. 가민 Personal API로 충분하면 이 경로는 필요 없습니다.

## 5. 파일 형식과 이 앱 모델의 대응

### 5.1 형식

- **FIT**: Activity 파일의 필수 메시지는 File Id, Activity, Session, Lap, Record입니다. 모든 요약 메시지에 Start Time, Total Elapsed Time(일시정지 포함), Total Timer Time(일시정지 제외)이 있고, Lap의 시간·거리 합은 Session과 같아야 합니다. 시간대는 Activity 메시지의 Local Timestamp로 구합니다. — [FIT Activity 파일](https://developer.garmin.com/fit/articles/file-types/activity.html), [FIT 프로토콜](https://developer.garmin.com/fit/protocol/). 필드 번호·배율(예: 시간은 1000배 저장)은 공식 Profile을 기준으로 다시 확인합니다(커뮤니티 미러: [ext_fit](https://hexdocs.pm/ext_fit/ExtFit.Profile.Messages.Session.html)).
- **TCX**: [TrainingCenterDatabase v2 스키마](https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd). `Activity/@Sport`는 Running·Biking·Other 세 가지뿐입니다. Lap마다 `StartTime`, `TotalTimeSeconds`, `DistanceMeters`, `Calories`, `AverageHeartRateBpm`, `MaximumHeartRateBpm`, `Cadence`가 있고 상승 고도 요약은 없습니다.
- **GPX**: 요약 필드가 없고 트랙 포인트뿐입니다. 심박·케이던스는 Garmin [TrackPointExtension](https://www8.garmin.com/xmlschemas/TrackPointExtensionv2.xsd)으로만 들어갑니다. 시간·거리는 포인트로 계산해야 합니다. — [GPX 1.1](https://www.topografix.com/GPX/1/1/)

### 5.2 `cardio_sessions` 대응

| `cardio_sessions`          | FIT session                                         | TCX                                       | Health Connect                                      |
| -------------------------- | --------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `date`, `start_time`(서울) | `start_time`(UTC) + Activity `local_timestamp`      | 첫 `Lap/@StartTime`(UTC)                  | `startTime` + `startZoneOffset`                     |
| `kind`                     | `sport`/`sub_sport`                                 | `Activity/@Sport`(3종)                    | `exerciseType`                                      |
| `duration_sec`             | `total_timer_time`(결정 필요: elapsed와 중 하나)    | Lap `TotalTimeSeconds` 합                 | `endTime − startTime`(segments 조정)                |
| `distance_km`              | `total_distance`(m)                                 | Lap `DistanceMeters` 합                   | `DistanceRecord` 합                                 |
| `avg_heart_rate`           | `avg_heart_rate`                                    | Lap `AverageHeartRateBpm`(시간 가중 평균) | `HeartRateRecord` 평균                              |
| `max_heart_rate`           | `max_heart_rate`                                    | Lap `MaximumHeartRateBpm` 최댓값          | 최댓값                                              |
| `calories_kcal`            | `total_calories`                                    | Lap `Calories` 합                         | `TotalCaloriesBurnedRecord`                         |
| `elevation_gain_m`         | `total_ascent`(확인 필요)                           | 없음(트랙 포인트로 계산하거나 비움)       | `ElevationGainedRecord`                             |
| `avg_cadence`              | `avg_cadence`/`avg_running_cadence`(단위 확인 필요) | Lap `Cadence`                             | `StepsCadenceRecord`/`CyclingPedalingCadenceRecord` |
| `effort`                   | 표준 필드 확인 못 함                                | 없음                                      | 없음                                                |
| `source`, `external_id`    | `file` 또는 `garmin` / 가민 활동 ID                 | `file` / `Activity/Id`                    | 출처 앱 / `metadata.id`                             |
| `memo`                     | 없음                                                | `Notes`                                   | `notes`·`title`                                     |

버리는 값: 랩·length·segment, GPS 경로, 초 단위 흐름(심박·속도·고도), 페이스 구간, 파워, 러닝 다이내믹스, 수영 영법·스트로크, Training Effect, VO2max, 회복 시간, 기기 정보.

### 5.3 나중에 랩(`cardio_laps`)을 만들 때

- FIT `lap` 메시지는 session과 같은 요약 필드(시작 시각, elapsed·timer 시간, 거리, 평균·최대 심박, 칼로리, 상승 고도, 케이던스)를 랩마다 가집니다. 랩 합계가 세션과 같아야 한다는 규칙이 있어 검증에 쓸 수 있습니다.
- TCX `Lap`도 같은 요약을 가지며 `Intensity`(Active·Resting), `TriggerMethod`(Manual·Distance·Time 등)가 있어 인터벌 구분에 쓸 수 있습니다.
- Health Connect `ExerciseSessionRecord.laps`는 시작·끝 시각과 길이만 있어 나머지는 다른 레코드에서 구간으로 모아야 합니다.

## 6. FIT 읽기와 ZIP

- 공식 [Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk)(`@garmin/fitsdk`): Garmin 저장소, Node.js·브라우저 지원, 메시지를 종류별로 모아 줍니다. 라이선스 종류·의존성 수·크기·최신 버전은 확인 못 함(npm 접근 403). 설치 전 확인이 필요합니다.
- 직접 최소 구현: 헤더, 정의·데이터 메시지(압축 타임스탬프·개발자 필드 포함), CRC-16을 처리하고 session·lap 필드 번호·배율 표를 옮겨야 합니다. 대략 300~600줄로 추정하며, 필드 표를 정확히 옮기는 것이 실제 비용입니다. — [FIT 프로토콜](https://developer.garmin.com/fit/protocol/)
- ZIP(가민 원본 내보내기, 계정 전체 내보내기): 브라우저 `DecompressionStream`은 gzip·deflate·deflate-raw만 다루고 ZIP 목록은 직접 파싱해야 합니다. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream). [fflate](https://github.com/101arrowz/fflate)는 MIT·순수 JS이고 압축 해제만 쓰면 약 3 kB입니다(런타임 의존성 0개는 확인 못 함).

## 7. 경로별 정리

| 경로                      | 가능 여부                        | 비용       | 주요 제약                                                                            |
| ------------------------- | -------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| 파일 업로드(TCX·GPX)      | 가능, 새 패키지 없음             | 무료       | 수동, GPX는 요약값이 없어 계산 필요                                                  |
| 파일 업로드(FIT)          | 가능, 패키지 또는 직접 구현      | 무료       | 패키지 설치 승인 또는 구현 비용                                                      |
| 가민 Personal API         | 가능(본인 데이터)                | 확인 못 함 | 키 최대 1년마다 재발급, 토큰 24시간, 한도·과거 범위·형식 확인 필요                   |
| 가민 Business API         | 사실상 불가(신규 신청 중단 보도) | 확인 못 함 | 승인·약관                                                                            |
| NRC 데이터 요청 파일      | 가능성 있음(형식 확인 필요)      | 무료       | 수동, 대기 시간                                                                      |
| NRC → Strava → Strava API | 가능(공식)                       | 현재 무료  | 연동 뒤 기록만, 원본 파일 없음, 약관                                                 |
| NRC·가민 비공식 API       | 쓰지 않음                        | —          | 약관 위반, 불안정                                                                    |
| Health Connect            | 안드로이드 앱 필요               | 개발 비용  | 기기 안에만 있음, 권한 받기 30일 전보다 오래된 기록은 별도 권한, #108 Capacitor 전환 |

## 7-1. 공통: 중복, 토큰, 개인정보, 주기

- **출처가 달라도 같은 기록**: 같은 달리기가 파일(`file`)과 Personal API(`garmin`) 또는 Strava 경유(`nike`)로 두 번 들어올 수 있습니다. 출처+외부 ID 중복 검사(#114)만으로는 막지 못하므로, 가져오는 모든 경로가 "같은 날짜·시작 시각 ±2분·거리 ±1%(또는 거리 없으면 시간 ±1%)인 기존 기록"을 중복 후보로 보여 주고 기본으로 건너뛰게 합니다(#119 미리보기 규칙을 공통으로).
- **토큰·키 보관**: 가민 Personal API 키와 Strava refresh token은 서버에만 두고 저장소에 커밋하지 않습니다. 환경 변수 또는 서버 비밀 파일(권한 600)에 두고, DB에 넣어야 하면 서버 비밀 키로 암호화합니다. 화면·로그·백업 파일에는 넣지 않습니다. 가민 키는 만료(최대 1년) 1주 전 메일과 앱 안 알림으로 갱신을 알립니다.
- **원본 파일과 개인정보**: 업로드하거나 내려받은 FIT·TCX·GPX·ZIP은 요약값을 뽑은 뒤 저장하지 않습니다(GPS 경로에는 집 위치가 들어 있음). 인바디 사진처럼 브라우저 안에서 읽는 방식을 우선합니다.
- **동기화 주기**: 하루 2회(예: 06:00·22:00 서울)와 화면의 "지금 가져오기" 버튼으로 제안합니다. Personal API 한도를 확인한 뒤 조정합니다. Strava는 1인 모드 한도(15분 200회) 안에서 같은 주기로 충분합니다.

## 8. 후속 이슈 범위 제안

- **#119 파일 가져오기**: TCX·GPX를 `DOMParser`로 먼저 만들고, FIT·ZIP은 아래 결정에 따릅니다. 미리보기·중복(출처+외부 ID 또는 시작 시각+거리)·저장 흐름은 이슈 범위대로입니다. 랩은 버립니다(#114 결정).
- **#121 가민 자동 동기화**: 범위 A(Developer Program 승인)를 **Garmin Personal API**로 바꿉니다. OAuth 연결 대신 사용자가 만든 키를 서버에 두고, 주기 조회·중복 방지·키 만료 알림을 만듭니다. 시작 전에 Swagger로 엔드포인트·형식·한도를 확인합니다.
- **#120 NRC**: 사용자가 본인 데이터를 요청해 파일 형식을 확인할 때까지 보류합니다. 자동 경로를 원하면 NRC→Strava 연동 뒤 Strava API(1인 모드)로 범위를 바꿉니다. Strava로 받으면 `source`는 원래 기록한 서비스인 `nike`로 두고 `external_id`는 Strava 활동 ID로 씁니다(지금 `source`에 `strava` 값은 없음, `015_cardio_sessions.sql`). `strava`를 따로 두려면 마이그레이션이 필요합니다(결정 항목 7).

## 9. 사용자 결정 항목

1. 가민 자동 동기화를 Personal API로 할지(키는 사용자가 만들어 서버에만 두고 1년마다 갱신).
2. FIT 읽기: 공식 `@garmin/fitsdk` 설치(라이선스·의존성 확인 후 설치 승인) 또는 session·lap만 읽는 직접 구현.
3. ZIP 지원: `fflate` 설치 또는 사용자가 직접 압축을 풀어 파일만 올리기.
4. NRC: 본인 데이터 요청으로 형식 확인 / NRC→Strava 연동 경로 / 보류·종료 중 선택.
5. 기록 시간 기준: FIT `total_timer_time`(일시정지 제외, 추천) 또는 `total_elapsed_time`(일시정지 포함).
6. Health Connect: 지금은 쓰지 않고 가민 Personal API로 충분한지 본 뒤 다시 판단(추천).
7. Strava로 받은 NRC 기록의 `source`: `nike`로 둠(추천, 마이그레이션 없음) 또는 `strava` 값을 새로 추가.
8. 출처가 다른 중복 판단 기준(7-1절의 시작 시각 ±2분·거리 ±1% 제안)과 동기화 주기(하루 2회 + 수동).
