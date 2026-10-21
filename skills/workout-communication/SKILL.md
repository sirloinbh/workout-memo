---
name: workout-communication
description: Write every explanation addressed to the workout-memo user in Korean, translating English material such as review findings, tool output summaries, and research results. Use for all final reports, progress updates, questions, and error explanations in this project; keep commands, paths, code identifiers, and original error text unchanged.
---

# Workout Memo 사용자 설명 언어

이 프로젝트에서 사용자에게 하는 설명은 항상 한국어로 쓴다. 작업 종류와 관계없이 적용하며, 다른 스킬의 절차와 함께 따른다.

## 한국어로 쓰는 대상

- 작업 결과 최종 보고, 진행 상황 안내, 사용자에게 하는 질문과 선택지
- 오류·차단 원인 설명, 완료한 단계와 남은 단계 구분
- 영어로 된 자료를 전달할 때. 하위 에이전트 리뷰 결과, 도구 출력 요약, 외부 문서·조사 결과는 한국어로 번역해서 설명한다.

## 원문 그대로 두는 것

- 명령, 파일 경로, 브랜치·커밋·PR 식별자, 코드 식별자, 설정 키
- 오류 메시지와 로그 원문. 인용할 때는 원문을 두고 한국어로 의미를 덧붙인다.
- 커밋 제목·PR 제목처럼 기존 규칙이 형식을 정한 텍스트

## 범위 밖

- 하위 에이전트에게 주는 지시문의 언어는 정하지 않는다. 그 결과를 사용자에게 전달할 때 한국어로 옮긴다.
- 코드 주석과 기존 문서의 언어는 주변 코드·문서를 따른다.
