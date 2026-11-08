# #118 가민·나이키 런 클럽 기록 가져오기 경로 조사

- 이슈: [#118](https://github.com/sirloinbh/workout-memo/issues/118) (상위 #217)
- 브랜치: `docs/118-activity-import`

## 목적

가민·NRC 러닝 기록을 개인 1인 앱이 합법적·안정적으로 가져올 경로를 정하기 위해 공식 API·내보내기·약관·비용·파일 형식을 조사했습니다. 코드는 바꾸지 않습니다.

## 변경 — docs

- 새 문서 [`docs/activity-import.md`](../activity-import.md): 경로별 가능 여부·제약·근거 링크, `cardio_sessions` 필드 대응과 버리는 값, 나중의 랩 형식(FIT·TCX·Health Connect), FIT 읽기·ZIP 처리 비교, 후속 이슈(#119·#120·#121) 범위 제안, 사용자 결정 항목 6개.
- 핵심 발견: Garmin이 2026년에 공개한 Personal API로 본인 데이터를 승인 없이 읽을 수 있습니다(공식 페이지 직접 확인). NRC는 공식 API가 없습니다.

## 검사

- 근거 링크는 공식 문서를 우선했고, 공식 출처로 확인하지 못한 내용은 "확인 못 함"으로 표시했습니다. Garmin Personal API 페이지·FAQ는 직접 열어 문구를 확인했습니다.
- prettier, `npm run test:docs`, 상대 링크 확인: 통과
