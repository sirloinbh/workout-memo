# #102 나의 목표 화면을 공통 컴포넌트로 교체 (1단계)

- 이슈: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- 브랜치: `feat/102-goals`

## 목적

#102를 화면마다 나눠 옮기는 첫 PR입니다. 나의 목표의 목표 목록, 목표 추가 폼, 다음 목표 제안을 공통 `Card`, `Badge`, `EmptyState`, `Button`, `Label`, `Input`과 유틸리티 클래스로 바꾸고, 이 화면만 쓰던 `style.css` 규칙을 지웁니다. 다음 단계는 종목 분석(2단계), 루틴 폼(3단계), 12주 미리보기·계획 보기(4단계)입니다.

## 변경 — feat: 나의 목표 교체

- `frontend/src/app.tsx`
  - 목표 목록: 목표마다 `Card`, 운동명은 `CardTitle`(h2)입니다. PC(768px 이상)는 2열, 그보다 좁으면 1열입니다. 이전 기준은 760px였습니다.
  - 상태 표시: `Badge`로 바꿨습니다. 달성 완료는 `success`, 기간 종료는 `warning`, 도전 중은 `outline`입니다. 이전에는 달성 완료만 초록 바탕이고 나머지 둘은 같은 노란 바탕이었습니다.
  - 목표 삭제: `Button`(`link`)이고 이름을 "<운동명> 목표 삭제"로 붙였습니다. 목표가 여럿이면 이전에는 같은 이름의 버튼이 여러 개였습니다. 삭제 전 확인은 그대로 `confirm`입니다.
  - 빈 상태: `EmptyState`(h2)입니다. 이전에는 h1 다음에 h3이 와서 제목 단계가 건너뛰었습니다. 머리글의 "목표 추가" 버튼과 이름이 겹치지 않도록 빈 상태에는 버튼을 두지 않았습니다.
  - 목표 폼: 입력은 공통 `Input`, 이름표는 공통 `Label`입니다. 2열 배치는 유틸리티로 옮겼고, 터치 기기의 480px 이하에서는 이전처럼 1열입니다. 안내 문구는 `.form-hint` 대신 `bg-muted`와 `text-meta`입니다.
  - 다음 목표 제안: 테두리 상자와 증량 단위 줄을 유틸리티로 옮겼습니다. "제안 적용"은 `sm` 크기입니다.
  - 목표 카드에는 별도 `data-slot`을 붙이지 않았습니다. #101에서처럼 `Card`의 `data-slot="card"`를 덮어쓰지 않기 위해서입니다.
- `frontend/src/style.css`: `.goal-grid`(반응형 포함), `.goal-card`, `.goal-card p`, `.badge`, `.badge.success`, `.goal-number`, `.goal-suggestion`, `.goal-step`, `.modal .goal-step label`을 지웠습니다. `.card`, `.empty`, `.text-button`, `.form-grid`, `.form-hint`, `.modal label`, `.field-error`는 다른 화면도 써서 남겼습니다.
- 앱 고유 `components/field`의 `Input`은 이제 화면에서 쓰지 않습니다. `modal.test.tsx`가 쓰고 있어 그대로 두었습니다.

## 테스트

- 추가: `frontend/src/goal-list.test.tsx` 4개
  - 목표 카드마다 상태 배지(도전 중·기간 종료·달성 완료), 목표 중량×반복, 기간, 안내 문구가 보이는지 확인합니다.
  - 삭제를 확인하면 그 목표만 `DELETE /api/goals/:id`로 지우고 카드가 사라지는지, 취소하면 요청이 없는지 확인합니다.
  - 목표가 없으면 빈 상태 안내가 보이는지 확인합니다.
- 기존: `goal-suggestion.test.tsx`(제안 적용·증량 단위 저장), `forms.test.tsx`(목표 폼 오류 문구)는 수정 없이 통과합니다.
- `npm run test -w frontend -- src/goal-list.test.tsx src/goal-suggestion.test.tsx src/forms.test.tsx`: 9 pass
- `npm run test -w frontend`: 214 pass, 4 skip
- `npm run typecheck -w frontend`, eslint·prettier(바꾼 파일): 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 세 워크트리가 동시에 돌아 메모리 부족 이력이 있어 로컬 전체 `npm run check`와 e2e는 돌리지 않았습니다.

## 변경 — fix: 1차 리뷰 보완

- 공통 `Input`은 768px 이상에서 글자가 14px(`md:text-body-sm`)이고, `style.css`의 터치 16px 규칙은 components 레이어라 이 유틸리티를 이기지 못합니다. 터치 768px의 목표 폼에서 `ui-touch` 검사(16px 미만 위반)가 실패하고 iPad에서 입력 시 확대될 수 있었습니다. 운동 기록 폼과 같은 `md:pointer-coarse:text-base`를 목표 폼 입력 5개와 증량 단위 입력에 붙였습니다.
- 빈 상태 테스트가 제목 단계(h2)도 확인하도록 했습니다.
- 반영하지 않음: 공통 `Label`의 `leading-none`이 `text-meta`의 줄 높이와 겹친다는 지적(nit). 이름표는 한 줄이라 화면 차이가 없고, 기준선 이미지로 확인합니다.
- 시각 기준선: goals·goal-editor 기준선 8장은 바뀔 것으로 봅니다. CI `e2e-visual` 결과 이미지를 확인한 뒤 `visual-baselines` 아티팩트로 갱신합니다.
- 1차 보완 후: `npm run test -w frontend -- src/goal-list.test.tsx src/goal-suggestion.test.tsx src/forms.test.tsx` 9 pass, eslint·`npm run typecheck -w frontend` 통과

## 변경 — test: 시각 기준선 갱신

- 2차 리뷰는 보완점이 없었습니다. 1차 보완(터치 16px 입력 6개, 빈 상태 h2 확인)이 모두 들어간 것을 확인했습니다. 리뷰 2회를 마쳐 3차 리뷰는 하지 않습니다.
- `3b9a70d`의 CI `e2e-visual`에서 `goals-360·390·768·1280`, `goal-editor-360·390·768·1280` 8장만 실패했고 axe·반응형 포함 나머지 70건은 통과했습니다.
- 1280px·360px 목표 화면과 390px 목표 추가 창을 이전 기준선과 나란히 보았습니다. 상태 배지 모양(도전 중 테두리, 달성 완료 초록), 카드 안 글자 크기(11px→14px), 입력 글자 크기가 바뀐 것 외에 배치 차이나 넘침이 없어 `visual-baselines` 아티팩트로 8장을 갱신했습니다.
