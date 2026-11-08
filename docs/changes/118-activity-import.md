# #118 가민·나이키 런 클럽 기록 가져오기 경로 조사

- 이슈: [#118](https://github.com/sirloinbh/workout-memo/issues/118) (상위 #217)
- 브랜치: `docs/118-activity-import`

## 목적

가민·NRC 러닝 기록을 개인 1인 앱이 합법적·안정적으로 가져올 경로를 정하기 위해 공식 API·내보내기·약관·비용·파일 형식을 조사했습니다. 코드는 바꾸지 않습니다.

## 변경 — docs

- 새 문서 [`docs/activity-import.md`](../activity-import.md): 경로별 가능 여부·제약·근거 링크, `cardio_sessions` 필드 대응과 버리는 값, 나중의 랩 형식(FIT·TCX·Health Connect), FIT 읽기·ZIP 처리 비교, 후속 이슈(#119·#120·#121) 범위 제안, 사용자 결정 항목 8개.
- 핵심 발견: Garmin이 2026년에 공개한 Personal API로 본인 데이터를 승인 없이 읽을 수 있습니다(공식 페이지 직접 확인). NRC는 공식 API가 없습니다.

## 1차 리뷰

- 공식 문서 대조(Garmin Personal API FAQ 문구, Health Connect 30일 규칙, Strava 1인 모드·한도, TCX `Sport` 값)는 모두 맞았습니다.
- 반영(필수): Strava로 받은 NRC 기록의 `source` 값(지금 `strava` 없음)을 #120 범위와 결정 항목에 적었습니다. 출처가 달라 생기는 중복(파일과 Personal API)을 막는 공통 규칙, 토큰·키 보관, 원본 파일·개인정보, 동기화 주기를 "7-1. 공통" 절로 더했습니다. 결정 항목은 8개가 됐습니다.
- 반영(선택): 표의 "30일 제한"을 "권한 받기 30일 전보다 오래된 기록"으로, Strava "읽기" 한도를 "업로드 외 요청"으로 고치고, 공식 권한 이름을 함께 적었습니다.

## 검사

- 근거 링크는 공식 문서를 우선했고, 공식 출처로 확인하지 못한 내용은 "확인 못 함"으로 표시했습니다. Garmin Personal API 페이지·FAQ는 직접 열어 문구를 확인했습니다.
- prettier, `npm run test:docs`, 상대 링크 확인: 통과
