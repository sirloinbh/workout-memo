# #101 운동 기록 카드 틀과 로컬 초안 안내를 공통 컴포넌트로 교체 (9단계)

- 이슈: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- 브랜치: `feat/101-journal-card`

## 목적

8단계 뒤 #101 완료 기준을 대조했을 때 남은 두 곳을 옮깁니다. 하나는 대시보드·운동 일지의 운동 기록 카드 틀(3단계에서는 목록 행만 옮김)이고, 다른 하나는 대시보드의 로컬 초안 복구 안내입니다. 이 PR이 병합되면 #101 완료 기준을 다시 대조하고 닫습니다.

## 변경 — feat: 카드 틀과 초안 안내 교체

- `frontend/src/app.tsx`
  - 운동 기록 카드: `.card journal-card`와 `.section-title`을 `Card`, `CardHeader`, `CardTitle`(h2), `CardDescription`, `CardAction`으로 바꿨습니다. 개수는 `.count` 대신 `Badge`(`secondary`)이고, "전체 기록"은 공통 `Button`(`ghost`, `sm`)입니다.
  - 빈 상태: `.empty`를 공통 `EmptyState`(h3, 아이콘, 설명, "운동 기록하기" `Button`)로 바꿨습니다. 불러오는 중 문구는 유틸리티 문단입니다.
  - 로컬 초안 안내: `section.card`를 `Card`(`role="region"`, 이름 "로컬 초안")로, "초안 복구"·"초안 폐기"를 `Button`(`secondary`, `ghost`)으로 바꿨습니다. `md`부터 문구와 버튼이 한 줄에 놓입니다.
- `frontend/src/style.css`: 지운 규칙이 없습니다. `.card`, `.section-title`, `.count`, `.empty`, `.subtle-button`, `.text-button`은 종목 분석·신체 기록·나의 목표·머신 라이브러리 등 #102·#103 범위 화면이 아직 씁니다. `.journal-card`에는 원래 규칙이 없었습니다.
- 화면 차이: 개수 표시가 `Badge` 모양이 되고, 빈 상태가 점선 테두리 상자 안에 들어갑니다. 설명 글자가 커집니다. 초안 안내는 이전에 카드 안쪽 여백 없이 문구와 버튼이 붙어 있었는데, 여백과 버튼 간격이 생깁니다.

## 테스트

- 추가: `frontend/src/period.test.tsx`에 1개. 제목이 개수를 포함해 "운동 기록 2"로 읽히는지, 대시보드의 "전체 기록"이 운동 일지로 가고 그곳에서는 사라지는지, 빈 기간에 "운동 기록 0"과 빈 상태가 보이고 그 안의 "운동 기록하기"가 새 기록 창을 여는지 확인합니다.
- 기존: 초안 복구·폐기 버튼은 `workout-draft.test.tsx` 등이 역할과 이름으로 누르므로 그대로 통과합니다.
- `npm run test -w frontend -- src/period.test.tsx`: 25 pass
- `npm run test -w frontend`: 210 pass, 4 skip
- `npm run typecheck -w frontend`, `npm run lint`, prettier: 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 로컬 전체 `npm run check`는 메모리 부족 이력이 있어 돌리지 않았습니다.

## 변경 — fix: 1차 리뷰 보완

- 카드에 붙인 `data-slot="journal-card"`가 `Card`의 `data-slot="card"`를 덮어써, 나중에 공통 선택자를 쓰면 이 카드만 빠질 수 있었습니다. 쓰는 곳이 없어 지웠습니다.
- 개수 `Badge`의 `text-meta`는 글자 크기와 함께 `muted-foreground` 색도 정해 `Badge`의 `text-secondary-foreground`와 겹쳤습니다. 크기만 정하는 `text-xs`로 바꿨습니다.
- 지적된 필수 사항 "시각 기준선 미갱신"은 이 저장소의 절차대로 CI 이미지를 확인한 뒤 갱신합니다.
- 1차 보완 후: `npm run test -w frontend -- src/period.test.tsx` 25 pass, `npm run lint`, `npm run typecheck -w frontend` 통과
