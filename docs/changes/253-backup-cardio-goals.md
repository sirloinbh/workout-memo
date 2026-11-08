# #253 백업·복원에 유산소 목표 넣기 (백업 v3)

- 이슈: [#253](https://github.com/sirloinbh/workout-memo/issues/253)
- 브랜치: `feat/253-backup-cardio-goals`
- 선행: #116(유산소 목표, `cardio_goals`), #114(백업 v2)
- 설계: 2026-11-08 사용자 결정 B1·B2([#253 댓글](https://github.com/sirloinbh/workout-memo/issues/253#issuecomment-6720765474))

## 목적

#116에서 만든 유산소 목표가 백업 파일에 없어, 백업 파일로 복원하면 유산소 목표가 사라졌습니다.

## 변경 — feat: 백업 v3

- `backend/src/backup.ts`
  - 형식 버전을 3으로 올리고 `data.cardio_goals`를 넣었습니다(B1). v3 파일에는 이 목록이 꼭 있어야 합니다(비어 있어도 됨). v1·v2 파일은 유산소 목표 없는 백업으로 복원하고, 그 파일에 섞여 있는 `cardio_goals`는 검사하지 않고 무시합니다(#114의 v1 처리와 같음).
  - 복원 전 검증: `POST /api/cardio-goals`와 같은 규칙(종류별 목표값, 기록 목표의 운동 종류, 목표 기간 5년 이하)과 id 중복을 봅니다.
  - 추가만(merge): 모든 값이 같은 목표가 있으면 건너뛰고, 아니면 추가합니다(근력 목표와 같음).
  - 전체 교체(replace, B2): 유산소 목표도 지우고 파일 내용으로 바꿉니다. 목표 목록이 없는 v1·v2 파일로 전체 교체하면 유산소 목표는 0개가 됩니다. 삭제 수는 미리보기 요약에 나옵니다. 잠금 목록에도 넣었습니다.
  - 내보내기 `GET /api/backup`에 `cardio_goals`(거리는 JSON 숫자)를 넣었습니다.
- `shared/contract.ts` → `contract:sync`: 백업이 `id`를 더할 수 있게 `cardioGoalSchema`를 필드 규칙 `cardioGoalObject`와 교차 규칙 `checkCardioGoal`로 나눴습니다(유산소 기록과 같은 방식). API 동작은 같습니다.
- `frontend/src/backup.tsx`: 복원 요약에 "유산소 목표" 줄을 더하고, 백업 설명에 유산소 기록·유산소 목표를 넣었습니다. 요약에 그 표가 없으면(이전 서버) 줄을 건너뜁니다.
- `database/README.md`: 파일 예시, v3 설명, 지원 버전, 복원 규칙. **v3 파일은 이전 버전의 앱으로 되돌려 배포하면 복원할 수 없다**는 점과 대처를 적었습니다(사용자 요청).

## 테스트

- `backend/test/backup.test.ts`(DB 없음)
  - 수정: 예시 백업에 유산소 목표를 넣었습니다. v2 시험은 `version: 2`를 명시했고, 지원하지 않는 버전 시험을 v4로 바꿨습니다. v2·v3 모두 `cardio_sessions` 목록이 꼭 있어야 하는지 확인합니다.
  - 추가 2개: v3 목록 필수와 빈 목록 허용, v1·v2의 목표 무시(깨진 목록 포함). 유산소 목표 검증(기록 목표의 종류, 기간 단위, 다른 종류의 목표값, 5년 상한, id 중복).
  - 13 pass
- `backend/test/backup.integration.test.ts`(PostgreSQL)
  - 시드에 유산소 목표 2개를 넣고, 정규화·행 수·추가만 재실행(건너뜀 2)·내보낸 키 목록에 넣었습니다. v1 복원 시험은 유산소 목표도 0개인지 봅니다.
  - 추가 1개: v3 왕복(추가 2, 값 일치, 판정 API 응답)과, v2 파일로 전체 교체하면 삭제 2·남은 목표 0개.
- `frontend/src/backup.test.tsx`: 복원 요약에 "유산소 목표 · 추가 1 · 건너뜀 1" 줄. 6 pass
- `typecheck -w backend`, eslint·prettier(바꾼 파일): 통과. 통합 테스트는 이 PC에 PostgreSQL이 없어 CI에서 확인합니다. 로컬 전체 `npm run check`·e2e는 메모리 부족으로 돌리지 않았습니다.
- 시각 기준선: 백업 화면 설명 문구가 길어져 backup 4장이 바뀔 수 있습니다. CI 이미지를 확인한 뒤 갱신합니다.

## 1차 리뷰

- 필수 지적 없음. 버전별 처리, 잠금·삭제 순서, 추가만의 같은 값 판단(DB 값과 백업 값의 형식), 계약 분리 후 API·OpenAPI가 같음을 확인했습니다.
- 반영(선택): v3 파일에 두 목록이 다 없으면 첫 오류만 보였습니다. 빠진 목록을 한 메시지로 모아 보여 주고 시험을 더했습니다. 유산소 목표의 `created_at`은 근력 목표처럼 백업에 넣지 않아 복원한 시각이 된다는 점을 `database/README.md`에 적었습니다.
