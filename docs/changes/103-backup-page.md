# #103 백업·내보내기 화면을 공통 컴포넌트로 교체 (1단계)

- 이슈: [#103](https://github.com/sirloinbh/workout-memo/issues/103)
- 브랜치: `feat/103-backup-page`

## 목적

#103(신체 기록·머신 라이브러리·백업 화면 교체)을 #101처럼 요소마다 PR 하나로 나눠 옮기는 첫 PR입니다. 가장 작은 백업·내보내기 화면부터 옮깁니다. 남은 단계는 머신 라이브러리 목록, 머신 등록·수정 폼과 공식 참고값, 신체 기록 추이와 기록 폼, 인바디 가져오기 미리보기 표, 마지막 `style.css` 정리입니다.

## 변경 — feat: 백업 화면 교체

- `frontend/src/backup.tsx`
  - 세 구역(분석용 CSV, 복원용 백업, 백업에서 복원)을 `section.card`에서 `Card`, `CardHeader`, `CardTitle`(h3), `CardContent`, `CardFooter`로 바꿨습니다. 설명 문단은 유틸리티(`text-body-sm text-muted-foreground`)입니다.
  - 내려받기 두 개는 `a.primary`에서 `Button asChild` 링크로 바꾸고 `Download` 아이콘을 붙였습니다. 주소와 `download` 속성은 그대로입니다.
  - 복원 방식·백업 파일·확인 문구는 공통 `Label`(`htmlFor`)과 `Input`입니다. 복원 방식은 #101 세트 행처럼 브라우저 기본 `select`를 두고 `Input`과 같은 모양의 유틸리티를 줬습니다. 공통 `Select`(Radix)는 값을 고르는 방식이 달라 화면 테스트의 `selectOptions`를 모두 바꿔야 합니다.
  - 진행·오류 문구는 공통 `Notice`입니다(`role="status"`, `role="alert"` 그대로).
  - 복원 미리보기는 테두리 상자 안에 표별 한 줄 목록("변경 요약")과 충돌 목록("충돌")을 둡니다. 표 이름은 진하게, 개수는 흐린 글자입니다.
  - 확인 단계: "전체 교체"를 고르면 "복원 실행"이 `destructive` 버튼이 됩니다. 확인 문구를 정확히 넣어야 켜지는 동작은 그대로입니다. 확인 문구 칸에 `autoComplete="off"`를 넣었습니다.
  - 페이지 제목 `h2`는 종목 분석·루틴짜기의 제목과 같은 legacy `h2` 규칙을 그대로 씁니다. 페이지 머리글 정리는 #222 범위입니다.
- `frontend/src/style.css`: `.backup-page .card`, `.backup-page a.primary`, `.backup-page label`, `.backup-page li`를 지웠습니다. `.card`, `.primary`, `.error`는 다른 화면이 아직 써서 남깁니다.
- 화면 차이: 카드 사이 간격과 안쪽 여백이 공통 `Card` 값이 되고, 설명 글자가 12px에서 14px로 커집니다. 내려받기 버튼에 아이콘이 생기고, 복원 방식과 파일 선택이 768px 이상에서 한 줄 두 칸입니다.

## 테스트

- 추가: `frontend/src/backup.test.tsx`에 1개. 내려받기가 이름 있는 링크인지, 세 카드 제목이 h3인지, 미리보기의 "변경 요약" 목록이 표마다 한 줄이고 충돌 목록이 따로 있는지, 미리보기 제목이 h4인지 확인합니다.
- 기존 4개는 라벨·버튼 이름이 같아 그대로 통과합니다.
- `npm run test -w frontend -- src/backup.test.tsx`: 5 pass
- `npm run typecheck -w frontend`, eslint(바뀐 파일), prettier: 통과
- 시각 기준선과 e2e(반응형·axe)는 PR CI로 확인합니다. 로컬 전체 `npm run check`와 e2e는 메모리 부족 이력이 있고 세 워크트리가 동시에 돌아 실행하지 않았습니다.

## main 병합

- 병합 직전 main이 #226(#224 기간 선택 줄), #227(#102 나의 목표)만큼 앞서 있어 `origin/main`을 merge했습니다. 충돌은 없었습니다. 병합 뒤 `npm run test -w frontend -- src/backup.test.tsx` 6 pass, `npm run typecheck -w frontend` 통과
