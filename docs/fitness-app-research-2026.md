# 피트니스 기록 서비스 조사와 구현 백로그

조사 기준일: **2026-10-15 (Asia/Seoul)**

문서 작업: [#30](https://github.com/sirloinbh/workout-memo/issues/30)

## 조사 기준과 한계

지정한 13개 서비스의 공식 사이트·도움말·개발자 앱스토어 설명을 우선 조사했다. 최근 흐름과 사용자 불만은 2025~2026년 자료를 사용했다. 발행일이 없는 상시 기능 안내 및 오래된 도움말은 현재 공개 자료로 참고했으며, 2025~2026년에 새로 출시된 기능이라고 해석하지 않는다. 직접 로그인·결제·기기 연결로 기능을 실측한 결과는 아니다.

- 빈도는 **전체 조사 대상 13개 중 공식 자료에서 확인한 최소 제공 수**다. 시장 점유율이나 완전한 지원/미지원 조사 결과가 아니다.
- 목록에 없는 서비스는 미지원으로 단정하지 않는다. 확인되지 않은 내용은 **미확인**이다.
- 7개 이상은 흔함, 4~6개는 중간, 1~3개는 선택적으로 분류한다. 러닝 전용 기능은 전체 빈도가 낮아도 해당 분야에서 중요할 수 있다.
- 유료·연동 기능도 포함한다. 동일 이름의 기능이라도 플랫폼·기기·요금제별 범위는 다를 수 있다.
- 해외 가격은 미국 USD 공개 가격, 연간 금액은 1년 결제 총액이다. 한국 가격·세금·프로모션과 다를 수 있다.
- 앱스토어에는 기존·실험·프로모션 구독 상품이 함께 표시될 수 있다. 상품 목록의 최저·최고 금액을 모든 신규 사용자에게 적용되는 요금제로 해석하지 않는다.
- 관찰된 경쟁 기능과 프로젝트에 대한 제안을 구분한다. 아래 백로그는 구현 완료 목록이 아니다.

## 서비스별 특징·가격·플랫폼·웹

서비스명 링크는 기능 출처이고 가격·플랫폼의 추가 근거는 마지막 열에 연결했다.

| 서비스                                  | 주된 기능                                    | 무료 및 유료 가격                                                                                              | 플랫폼                                              | 실제 운동 관리 웹 버전                                               | 추가 근거                                                      |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Strong][strong]                        | 웨이트 기록, 타이머, 1RM, 신체 측정          | 무료 루틴 3개·운동 기록 무제한. PRO 월 $4.99 / 연 $29.99. 평생 상품 $99.99 표시                                | iOS·Android·Apple Watch                             | 브라우저 기록 미확인                                                 | [공식 스토어][strong-store]                                    |
| [Hevy][hevy]                            | 기록, 통계, 소셜, 루틴 공유                  | 무료 루틴 4개·사용자 운동 7개 등 제한. PRO 월 $2.99 / 연 $23.99 / 평생 $74.99                                  | iOS·Android·Apple Watch·웹                          | 있음: 기록·루틴 관리                                                 | [가격][hevy-price], [웹 지원][hevy-web]                        |
| [JEFIT][jefit]                          | 운동 라이브러리, 루틴, 커뮤니티, 자동 증량   | Basic 무료. Elite 월 $12.99 / 연 $69.99. 조사 시 첫해 $52.49 프로모션 표시                                     | iOS·Android·웹·Apple Watch·Wear OS                  | 있음: 계획·기록·분석                                                 | [가격][jefit-price], [플랫폼][jefit-platform]                  |
| [FitNotes][fitnotes]                    | 간결한 기록, 백업, CSV                       | 기본 무료·광고 없음. 별도 Supporter 구매 가격 미확인                                                           | Android                                             | 기록 웹앱 미확인                                                     | [공식 스토어][fitnotes-store]                                  |
| [Strava][strava]                        | 러닝·사이클링, 경로, 구간 순위, 커뮤니티     | 기본 무료. 월 $11.99 / 연 $79.99                                                                               | iOS·Android·웹·호환 워치/GPS 기기                   | 있음: 분석·경로·파일 관리                                            | [가격][strava-price], [기기][strava-devices]                   |
| [Nike Run Club][nrc]                    | 러닝 기록, 오디오 코칭, 계획, 챌린지         | 무료·앱 내 구입 없음                                                                                           | iOS·Android·Apple Watch 등                          | 공식 안내는 앱에서 조회. 독립 기록 웹앱 미확인                       | [공식 FAQ][nrc-faq], [스토어][nrc-store]                       |
| [Garmin Connect][garmin]                | 운동·건강 통합, 훈련 계획, 회복, 기기 연동   | 기본 무료. Connect+ 공개 요금 월 $6.99 / 연 $69.99. 기기 비용 별도                                             | iOS·Android·웹·Garmin 기기                          | 있음: 운동·건강 분석과 계획                                          | [2025 공개 요금][garmin-plus]                                  |
| [Fitbod][fitbod]                        | 장비·목표·수행·회복 기반 운동 추천           | 체험 후 구독. 웹 구매 월 $15.99 / 연 $95.99                                                                    | iOS·Android·호환 워치                               | 가입·결제 제공. FAQ는 웹을 온보딩 용도로 명시. 운동 입력 웹앱 미확인 | [FAQ][fitbod]                                                  |
| [MyFitnessPal][mfp]                     | 식단·칼로리·영양소·체중, 운동 기록           | 기본 무료. Premium 연 $79.99. Premium+ 월 $24.99 / 연 $99.99                                                   | iOS·Android·웹·외부 건강 서비스                     | 있음: 식단·운동·신체 측정                                            | [가격][mfp-price], [웹 측정][mfp-measures]                     |
| [Apple Fitness / Fitness+][apple-store] | 활동 링·운동·훈련량·공유 / 유료 운동 영상    | Fitness 무료. Fitness+ 미국 월 $9.99 / 연 $79.99                                                               | iPhone·Apple Watch. Fitness+는 iPad·Apple TV도 지원 | 브라우저 운동 관리 미확인                                            | [Fitness+][apple-plus], [지역 안내][apple-markets]             |
| [Google Fit][google-fit]                | 걸음·활동·심장 강화 점수·체중                | 무료                                                                                                           | Android·iOS·Wear OS                                 | 소비자용 기록 웹앱 미확인                                            | [도움말][google-fit-help], [2026 전환 안내][google-health]     |
| [플랜핏][planfit]                       | 장비 기반 AI 루틴, 중량·반복 추천, 음성 코칭 | 기본 무료. 한국 iOS에 월 10,900~13,900원 / 연 64,900~69,900원 등의 상품 표시. 실제 적용 요금 미확인            | iOS·Android·Apple Watch                             | 웹 생성기 안내·로그인 존재. 모바일과 동등한 기록 기능 미확인         | [한국 스토어][planfit-store], [생성기 안내][planfit-generator] |
| [번핏][burnfit]                         | 웨이트·1RM·피로도·루틴·식단·AI 리포트        | 기본 무료. 한국 iOS에 월 5,900원·9,900원 / 연 42,500원·49,500원·69,900원 등의 상품 표시. 실제 적용 요금 미확인 | iOS·Android·Apple Watch                             | 개인 기록 웹앱 미확인                                                | [한국 스토어][burnfit-store]                                   |

### 혼동하기 쉬운 서비스 범위

1. FitNotes는 **James Gay의 Android 앱**이다. 이름이 비슷한 iOS 앱 기능을 합치지 않았다. 공식 스토어는 2025-10-24 업데이트와 2026년 사용자 리뷰를 공개하고 있다.
2. Apple의 무료 Fitness와 유료 Fitness+를 구분한다. 한국 Fitness 앱 제공만으로 Fitness+ 한국 구독 가능 여부를 판단하지 않았다. **Fitness+ 한국 가격은 미확인**이다.
3. Google은 2026-05-07 Fitbit 앱의 Google Health 전환과 Google Fit 사용자의 연내 데이터 이전 안내 계획을 발표했다. Google Health의 신규 기능을 Google Fit에 합산하지 않았다. 개별 사용자의 이전 완료 여부는 미확인이다.
4. Google Fit API의 2026년 사용 중단 안내는 소비자 앱의 즉시 종료와 동일하지 않다. 새 연동 개발은 [공식 이전 안내][google-fit-api]를 확인해야 한다.
5. Fitbod의 과거 도움말은 웹 보고서 조회도 설명하지만, 현재 FAQ는 웹을 온보딩 용도로 명시한다. 따라서 완전한 운동 기록 웹앱으로 집계하지 않았다.

## 11개 분야별 기능과 확인 빈도

NRC는 Nike Run Club, Garmin은 Garmin Connect, MFP는 MyFitnessPal, Apple은 Fitness/Fitness+를 의미한다. 제공 서비스의 근거는 위 서비스별 공식 링크이며, 세부 예외는 표 뒤에 적었다.

| 분야            | 기능                                      | 제공 확인 서비스                                                             | 최소 빈도          |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| 운동 기록       | 중량·횟수·세트                            | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, 플랜핏, 번핏                  | 8/13 · 흔함        |
| 운동 기록       | 이전 기록 확인·불러오기·복사              | Strong, Hevy, FitNotes, Fitbod, 플랜핏, 번핏                                 | 6/13 · 중간        |
| 운동 기록       | 세트 간 휴식 타이머                       | Strong, Hevy, JEFIT, FitNotes, 플랜핏, 번핏                                  | 6/13 · 중간        |
| 운동 기록       | 슈퍼세트·드롭세트 등 세트 구성            | Strong, Hevy, JEFIT, FitNotes, Fitbod, 플랜핏, 번핏                          | 7/13 · 흔함        |
| 운동 기록       | RPE 기록                                  | Strong, Hevy, 번핏                                                           | 3/13 · 선택적      |
| 운동 기록       | GPS·거리·시간·페이스                      | Strava, NRC, Garmin, Google Fit                                              | 4/13 · 유산소 핵심 |
| 루틴            | 루틴 직접 생성·저장·재사용                | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, 플랜핏, 번핏                  | 8/13 · 흔함        |
| 루틴            | 사전 제작·개인화 훈련 프로그램            | Hevy, JEFIT, NRC, Garmin, Fitbod, Apple, 플랜핏, 번핏                        | 8/13 · 흔함        |
| 루틴            | 수행에 따른 다음 중량·운동 조정           | Hevy Trainer, JEFIT, Fitbod, 플랜핏, 번핏                                    | 5/13 · 중간        |
| 통계            | 중량·볼륨·근력 성장 그래프                | Strong, Hevy, JEFIT, FitNotes, Fitbod, 플랜핏, 번핏                          | 7/13 · 흔함        |
| 통계            | 추정 1RM·개인 최고기록                    | Strong, Hevy, JEFIT, FitNotes, Fitbod, 번핏                                  | 6/13 · 중간        |
| 통계            | 부위별 운동량·세트 분포                   | Hevy, JEFIT, Fitbod, 번핏                                                    | 4/13 · 중간        |
| 통계            | 회복·피로 상태의 운동 선택 반영           | Garmin, Fitbod, 플랜핏, 번핏                                                 | 4/13 · 중간        |
| 신체 측정       | 체중·체성분·둘레 중 하나 이상             | Strong, Hevy, JEFIT, FitNotes, Garmin, Fitbod, MFP, Google Fit, 플랜핏, 번핏 | 10/13 · 흔함       |
| 신체 측정       | 변화 사진                                 | Strong, Hevy                                                                 | 2/13 · 선택적      |
| 신체 측정       | 체성분 검사지 스캔 입력                   | 플랜핏                                                                       | 1/13 · 선택적      |
| 소셜            | 친구·피드·그룹·활동 공유                  | Hevy, JEFIT, Strava, NRC, Garmin, Apple, 플랜핏, 번핏                        | 8/13 · 흔함        |
| 소셜            | 루틴·운동 구성 공유                       | Strong, Hevy, JEFIT, Fitbod, 번핏                                            | 5/13 · 중간        |
| 기기 연동       | 워치 운동 수행·기록 또는 기기 기록 동기화 | Strong, Hevy, JEFIT, Strava, NRC, Garmin, Fitbod, Apple, 플랜핏, 번핏        | 10/13 · 흔함       |
| 기기 연동       | 여러 제조사의 GPS·운동 기기 연결          | Strava, NRC, Garmin                                                          | 3/13 · 선택적      |
| 목표·배지       | 챌린지·배지·포인트·친구 경쟁              | JEFIT, Strava, NRC, Garmin, Apple                                            | 5/13 · 중간        |
| 목표·배지       | 연속 운동·꾸준함 시각화                   | Hevy, Fitbod, 플랜핏                                                         | 3/13 · 선택적      |
| AI 추천         | AI·학습 기반 운동·중량 추천을 명시        | JEFIT, Fitbod, 플랜핏, 번핏                                                  | 4/13 · 중간        |
| AI 추천         | 자연어 인사이트·리포트                    | Strava, Garmin, 번핏                                                         | 3/13 · 선택적      |
| 영양            | 음식·칼로리·탄단지 기록                   | MFP, 번핏, Garmin Connect+                                                   | 3/13 · 선택적      |
| 영양            | 사진·음성·바코드 음식 입력                | MFP                                                                          | 1/13 · 선택적      |
| 영양            | 식단 계획·레시피·장보기 목록              | MFP Premium+                                                                 | 1/13 · 선택적      |
| 데이터 내보내기 | 사용자 데이터 파일 내보내기               | Strong, Hevy, FitNotes, Strava, Garmin, MFP, Google Fit                      | 7/13 · 흔함        |
| 지원 플랫폼     | 소비자용 기록·관리 웹 버전                | Hevy, JEFIT, Strava, Garmin, MFP                                             | 5/13 · 중간        |

### 기능 해석의 제한

- **Hevy Trainer:** [공식 설명][hevy-trainer]은 적응형 알고리즘과 자동 중량 조정을 설명한다. 자동 추천으로 분류했지만 생성형 AI라고 단정하지 않았다.
- **JEFIT:** [FAQ][jefit]는 Strength Engine 제공 중, Mesocycle Adaptation 예정으로 설명한다. [2026년 소개][jefit-platform]는 4주 주기화를 설명한다. 자료가 일치하지 않으므로 완성된 자동 주기화의 전체 사용자 제공 범위는 미확인이다.
- **신체 측정:** 체중 입력만 가능한 서비스와 체지방·둘레·사진까지 지원하는 서비스는 같지 않다. [Hevy 측정][hevy-measures], [Fitbod Apple Health 연동][fitbod-health], [Garmin 체중 안내][garmin-weight], [MFP 측정][mfp-measures], [JEFIT 본인 서비스 설명][jefit-body]을 구분해 참고한다.
- **AI 분석:** [Strava Athlete Intelligence][strava-ai]는 생성형 AI 활동 요약이다. 운동 계획 생성 기능과 구분한다.
- **영양 확장:** [Garmin의 2026년 Connect+ 설명][garmin-dashboard]에는 칼로리·영양소 기록이 포함된다. 기본 무료 기능으로 해석하지 않는다.
- 플랫폼 열의 지원은 모든 플랫폼에서 동일한 세부 기능을 제공한다는 의미가 아니다.

## 데이터 내보내기·백업 비교

| 서비스                       | 확인한 방식과 제한                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Strong                       | [운동 데이터 CSV][strong-export]                                                                 |
| Hevy                         | [운동·신체 측정 데이터 내보내기][hevy-export], 스프레드시트 활용                                 |
| FitNotes                     | [운동·신체 측정 CSV와 별도 백업 파일][fitnotes-data]. CSV로 복원할 수 없음                       |
| Strava                       | [원본 활동 파일·GPX·TCX·계정 전체 다운로드][strava-export]. 내보내기는 웹에서 제공               |
| Garmin                       | [웹 활동 파일 내보내기][garmin-export]                                                           |
| MFP                          | [Premium CSV 내보내기][mfp-export]                                                               |
| Google Fit                   | [Google Takeout 다운로드][google-fit-help]                                                       |
| Apple Fitness                | 자체 내보내기 미확인. Apple Health에 저장된 운동·건강 데이터는 [XML 내보내기][apple-export] 가능 |
| JEFIT·Fitbod·플랜핏·번핏·NRC | 직접 실행하는 표준 CSV·전체 기록 내보내기 절차 미확인                                            |

백업, 분석용 CSV, 다른 서비스와의 동기화는 별개 기능이다. 클라우드 동기화가 있다는 이유만으로 사용자가 복구 가능한 백업을 보유한다고 판단하지 않는다.

## 기본 기능과 차별화 분석

다음은 조사 결과를 바탕으로 한 **Workout Memo에 대한 제안**이다.

### 기본 기능

- 날짜별 종목·총중량·반복·세트 기록과 수정/삭제.
- 이전 기록 확인·불러오기·세트 복사, 루틴 저장과 오늘 운동 불러오기.
- 휴식 타이머·세트 완료 표시, 캘린더·종목별 이력.
- 중량·볼륨 추이와 PR, 저장 실패 안내·재시도·백업.
- 모바일·PC에서 같은 서버 기록 접근, CSV 내보내기와 복원 가능한 백업.
- 사용자 정의 종목·장비·단위. 신체 측정은 기본 기록 안정화 이후 확장.

### 프로젝트에 맞는 차별화 후보

| 방향               | 참고 서비스                           | 적용 후보                          |
| ------------------ | ------------------------------------- | ---------------------------------- |
| 입력 최소화        | Strong·Hevy·FitNotes·번핏             | 이전 값 제시, 달라진 값만 수정     |
| 다음 목표 안내     | Hevy Trainer·JEFIT·Fitbod·플랜핏·번핏 | 증량·횟수 증가 조건과 목표 표시    |
| 회복과 계획 연결   | Garmin·Fitbod·플랜핏·번핏             | 휴식 일정 이동·디로딩 명시         |
| 장비 환경 반영     | Fitbod·플랜핏                         | 실제 머신·원판·덤벨 범위 반영      |
| 이해하기 쉬운 분석 | Hevy·JEFIT·번핏                       | 주간 부위별 세트·PR·목표 대비 수행 |
| 데이터 이동성      | Strong·Hevy·FitNotes·Strava           | CSV와 복원 가능한 백업을 구분      |

이미 요청한 **12주 계획 → 주간 목표 → 실제 기록 → 다음 목표** 연결을 우선한다. 오늘 휴식 선택의 일정 변화와 제외될 마지막 목표를 미리 보여준다. 머신 중량은 기본중량·추가 원판·총중량 및 공식 출처·확인일·미확인을 구분한다. PC는 계획 편집, 모바일은 오늘 운동 기록을 중심으로 검증한다.

이번 자료만으로 이 조합이 경쟁 서비스에 전혀 없거나 시장 최초라고 주장하지 않는다. 경쟁력 판단에는 실제 사용성 비교가 추가로 필요하다.

## 2025~2026년 흐름

1. **기록 이후 다음 행동 안내:** Fitbod, Hevy Trainer, 번핏이 수행·회복에 따라 운동이나 중량을 조정한다. 단순 그래프에서 다음 운동 결정으로 확장한다.
2. **추천과 해설의 분화:** 운동·중량을 정하는 기능과 Strava/Garmin의 자연어 인사이트는 서로 다른 효용이다. AI라는 이름만으로 같은 기능으로 묶지 않는다.
3. **입력 자동화:** MFP의 음식 사진·음성 입력, 플랜핏의 체성분 검사지 스캔처럼 타이핑을 줄이는 방향이다. [플랜핏 업데이트][planfit-store]는 2026년 9월 검사지 스캔을 안내한다.
4. **운동·회복·신체·영양 통합:** Garmin, 번핏, Google Health 전환이 사례다. 통합 범위가 커지면서 연동 안정성과 데이터 이동이 중요해진다.
5. **기본 무료+고급 유료:** 고급 통계·추천·AI·계획·워치 등에 과금한다. 서비스별 실제 유료 경계는 위 요금제와 도움말을 확인해야 한다.

## 2025~2026년 리뷰에서 반복 관찰한 불만

공개 리뷰·커뮤니티의 정성적 관찰이며 대표 표본 통계가 아니다. 동일 장애의 여러 글을 서로 독립적인 장애로 세지 않았다. 현재 버전의 재현 여부나 결함률은 미확인이다.

| 주제                           | 공개 사례                                                                            | 프로젝트 대응                        |
| ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------ |
| 구독료·기존 기능 유료화        | JEFIT [워치 관련 2025.6][review-jefit-watch], [빠른 운동 2025.7][review-jefit-quick] | 기본 기록·데이터 접근 범위 유지      |
| 동기화 지연·기록 누락          | NRC [2025.4][review-nrc-apr], [2025.5][review-nrc-may]                               | 초안 보존·저장 확인·중복 없는 재전송 |
| 플랫폼·배포별 기능 차이        | Fitbod [2025.7][review-fitbod-2025], [2026.5][review-fitbod-2026]                    | 모바일·PC 범위 명시·핵심 흐름 검증   |
| AI의 낮은 실용성·부정확한 해설 | Garmin [2025.10][review-garmin-oct], [2025.12][review-garmin-dec]                    | 사실 계산 우선·추천 근거 표시        |
| 기초 데이터 정확성             | MFP [2025.5 복수 사용자 의견][review-mfp]                                            | 출처·수정·미확인 표시                |
| 웹·모바일 기능 차이            | Hevy [웹 통계 요구 2025.7][review-hevy]                                              | PC·모바일 주요 작업 확인             |

마지막 두 행은 제한된 게시글에서 여러 의견 또는 요구를 확인한 사례이며 서비스 전체에서 빈도가 높다는 근거는 아니다.

## 추가 구현 이슈와 중복 방지

이번 요청은 **문서화와 이슈 등록까지**다. 아래 기능의 코드 구현·워커 큐 등록은 하지 않는다.

| 순서    | 이슈                                                                                                                                         | 범위·의존성                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 기존    | [#16 일지·세트](https://github.com/sirloinbh/workout-memo/issues/16), [#17 기간별 통계](https://github.com/sirloinbh/workout-memo/issues/17) | 핵심 기록·기간 조회 재사용                               |
| 기존    | [#27 12주 루틴](https://github.com/sirloinbh/workout-memo/issues/27)                                                                         | 분할·부위·주차 목표·디로딩                               |
| 기존    | [#28 목표·휴식·간편 입력](https://github.com/sirloinbh/workout-memo/issues/28)                                                               | 루틴 초안·입력 최소화·일정 이동. 중복 카드 생성하지 않음 |
| 기존    | [#29 머신 공식 기본중량](https://github.com/sirloinbh/workout-memo/issues/29)                                                                | 공식 출처와 미확인 구분                                  |
| 추가 P1 | [#31 세트 완료·휴식 타이머·RPE](https://github.com/sirloinbh/workout-memo/issues/31)                                                         | #16/#28 연계. 초안과 실제 수행 구분                      |
| 추가 P1 | [#34 초안·저장 상태·재시도](https://github.com/sirloinbh/workout-memo/issues/34)                                                             | 저장 확인·응답 유실·동시 수정·중복 방지                  |
| 추가 P1 | [#33 CSV·백업·복원](https://github.com/sirloinbh/workout-memo/issues/33)                                                                     | 분석용 CSV와 복원 형식 분리. 기존 SQL 백업 재사용 검토   |
| 추가 P2 | [#32 PR·추정 1RM·부위별 운동량](https://github.com/sirloinbh/workout-memo/issues/32)                                                         | #17 확장, #27 부위 매핑 의존                             |
| 추가 P2 | [#35 신체 측정·추이](https://github.com/sirloinbh/workout-memo/issues/35)                                                                    | 체중·체지방률·골격근량. #17 기간 선택 재사용             |

P1/P2는 본 문서의 제안 순서이며 GitHub 라벨·마일스톤이나 확정 일정이 아니다. 카드별 완료 기준과 검증 방법을 구현 착수 시 기준으로 사용한다.

### 후순위 검토 목록

소셜·배지·식단 DB·사진/OCR·워치 앱·생성형 AI 해설·타사 CSV 가져오기·전체 오프라인 동기화는 이번 신규 구현 카드에 포함하지 않았다. 개인용 목적의 효용과 개발·운영·AI 호출 비용을 먼저 평가한다. 모바일/PC 사용성은 별도 중복 카드 대신 각 UI 카드의 검증 기준에 포함했다.

## 출처

아래 링크는 조사 당시 확인한 공개 자료다. 변경되는 요금·출시 범위는 실제 적용 전에 다시 확인한다.

[strong]: https://www.strong.app/
[strong-store]: https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
[strong-export]: https://help.strongapp.io/article/235-export-workout-data
[hevy]: https://www.hevyapp.com/features/
[hevy-price]: https://www.hevyapp.com/hevy-pricing-comparison/
[hevy-web]: https://www.hevyapp.com/use-cases/workout-logger/
[hevy-trainer]: https://www.hevyapp.com/features/workout-plan-generator/
[hevy-measures]: https://www.hevyapp.com/features/track-body-measurements/
[hevy-export]: https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy
[jefit]: https://www.jefit.com/support/faq
[jefit-price]: https://cdn.jefit.com/elite
[jefit-platform]: https://www.jefit.com/blog/jefit-vs-caliber
[jefit-body]: https://www.jefit.com/wp/guide/best-workout-apps-for-2026-top-7-options-tested-and-reviewed/
[fitnotes]: https://www.fitnotesapp.com/help_overview/
[fitnotes-store]: https://play.google.com/store/apps/details?id=com.github.jamesgay.fitnotes
[fitnotes-data]: https://www.fitnotesapp.com/settings/
[strava]: https://www.strava.com/gift
[strava-price]: https://www.strava.com/pricing
[strava-devices]: https://support.strava.com/en-us/articles/16312772-what-devices-and-apps-are-compatible-with-strava
[strava-ai]: https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava
[strava-export]: https://support.strava.com/en-us/articles/15401919-how-do-i-export-my-strava-data
[nrc]: https://www.nike.com/nrc-app
[nrc-faq]: https://www.nike.com/nz/nrc-app
[nrc-store]: https://apps.apple.com/us/app/nike-gps/id387771637
[garmin]: https://connect.garmin.com/
[garmin-plus]: https://www.garmin.com/en-US/newsroom/press-release/wearables-health/elevate-your-health-and-fitness-goals-with-garmin-connect/
[garmin-dashboard]: https://www.garmin.com/en-US/blog/fitness/what-is-the-garmin-connect-performance-dashboard/
[garmin-weight]: https://support.garmin.com/en-US/?faq=zS4yMMr7REAVHBPYY6DaZ5
[garmin-export]: https://support.garmin.com/en-IN/?faq=W1TvTPW8JZ6LfJSfK512Q8
[fitbod]: https://fitbod.me/faqs/
[fitbod-health]: https://help.fitbod.me/hc/en-us/articles/360047357794-Apple-Health
[mfp]: https://support.myfitnesspal.com/hc/en-us/articles/15457546881805-What-is-included-in-the-free-version
[mfp-price]: https://www.myfitnesspal.com/premium-plus
[mfp-measures]: https://support.myfitnesspal.com/hc/en-us/articles/360032624891-Can-I-track-additional-measurements-or-change-the-default-measurements
[mfp-export]: https://blog.myfitnesspal.com/myfitnesspal-vs-mynetdiary/
[apple-store]: https://apps.apple.com/kr/app/apple-fitness/id1208224953
[apple-plus]: https://www.apple.com/apple-fitness-plus/
[apple-markets]: https://www.apple.com/newsroom/2025/12/apple-fitness-plus-expands-to-28-new-markets/
[apple-export]: https://support.apple.com/en-gb/guide/iphone/iph5ede58c3d/27/ios/27
[google-fit]: https://www.google.com/fit/
[google-fit-help]: https://support.google.com/fit/faq/6108483?hl=en
[google-health]: https://blog.google/products-and-platforms/products/google-health/google-health-app/
[google-fit-api]: https://developers.google.com/fit/overview
[planfit]: https://planfit.ai/ko
[planfit-store]: https://apps.apple.com/kr/app/id1511876936
[planfit-generator]: https://planfit.ai/ko/ai-workout-generator
[burnfit]: https://burnfit.io/en/
[burnfit-store]: https://apps.apple.com/kr/app/id1503464984
[review-jefit-watch]: https://www.reddit.com/r/jefit/comments/1ldqu3a/really_you_need_elite_now_to_use_your_watch_during/
[review-jefit-quick]: https://www.reddit.com/r/jefit/comments/1ll9bq3/regarding_the_new_update_quick_exercise_is_now/
[review-nrc-apr]: https://www.reddit.com/r/nikerunclub/comments/1k3nx74/
[review-nrc-may]: https://www.reddit.com/r/nikerunclub/comments/1kekizn/
[review-fitbod-2025]: https://www.reddit.com/r/fitbod/comments/1m0s3dz/
[review-fitbod-2026]: https://www.reddit.com/r/fitbod/comments/1tgoan3/no_focus_exercises_injury_mode_at_my_phone/
[review-garmin-oct]: https://www.reddit.com/r/Garmin/comments/1ojn9qw/we_all_tried_garmin_ai_on_launch_and_it_sucked/
[review-garmin-dec]: https://www.reddit.com/r/Garmin/comments/1plwz2g/connect_ai_is_a_joke/
[review-mfp]: https://www.reddit.com/r/Myfitnesspal/comments/1kiiath/does_premium_have_more_accurate_food_data/
[review-hevy]: https://www.reddit.com/r/Hevy/comments/1ltt91f/is_there_a_way_to_show_the_statistics_in_the_web/
