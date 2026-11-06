# #223 연결 오류·저장 경고 알림을 공통 컴포넌트로 교체

- 이슈: [#223](https://github.com/sirloinbh/workout-memo/issues/223)
- 브랜치: `feat/223-app-notices`
- 상위 이슈: #213 화면을 공통 UI 컴포넌트로 교체

## 목적

#101 뒤에도 대시보드·운동 일지 위쪽 알림(연결 오류, 저장 경고, 저장 상태)은 legacy `.error` 스타일과 기본 `button`이었습니다. 공통 알림 부품을 정하고 `app.tsx`의 알림을 옮깁니다.

## 부품 결정

- `components/ui`(중앙 관리)에는 `Alert`가 없습니다. 있는 것은 `Notice`(#311)뿐인데, 글자색만 바꾸는 한 줄 문단이라 상자와 "다시 연결" 같은 동작 버튼을 담지 못합니다.
- 그래서 둘로 나눴습니다.
  - 실패·경고: 새 프로젝트 부품 `frontend/src/components/alert-banner.tsx`의 `AlertBanner`. `role="alert"`, 공통 토큰(`destructive` 테두리·왼쪽 4px 선, `bg-destructive/10` 바탕)으로 칠한 상자이고 `action`에 공통 `Button`을 넣습니다. 글자는 `text-foreground`입니다(1차 리뷰 보완 참고). 기본 아래 여백은 `mb-5`(legacy `.error`의 20px)이며 `className`으로 바꿉니다.
  - 진행·성공 한 줄(저장 상태): 중앙 공통 `Notice`(`role="status"`).
- 중앙 리포에 `Alert` 추가를 요청할지는 다른 화면(#102·#103)이 이 부품을 써 본 뒤 정합니다. 쓰임이 굳으면 그때 옮깁니다.

## 변경 — feat: 앱 위쪽·일지 편집 창 알림 교체

- `frontend/src/app.tsx`
  - 연결 오류: `div.error` + 기본 `button`을 `AlertBanner`로 바꾸고, "다시 연결"은 `Button`(`outline`, `sm`)으로 바꿨습니다.
  - 저장 경고(로컬 저장 공간 오류): 앱 위쪽과 편집 창 모두 `AlertBanner`.
  - 저장 상태("저장 중…", "서버 저장 완료" 등): 앱 위쪽과 편집 창 모두 `Notice`. 빈 문자열이면 그리지 않습니다(`statusNotice`).
  - 편집 창의 저장 실패: `AlertBanner`, "다시 저장 재시도"는 `Button`(`outline`, `sm`). 저장 중에는 이전처럼 누를 수 없습니다.
  - 같은 파일의 기간 주소 오류(#224에서 남김)와 휴식 타이머 경고도 `AlertBanner`로 옮겼습니다.
  - `role="alert"`·`role="status"`와 문구는 그대로입니다.
- `frontend/src/style.css`: 지운 규칙이 없습니다. `.error`, `.error button`은 종목 분석·루틴(#102), 신체 기록·백업·인바디 가져오기(#103)가 아직 씁니다. 이 화면들은 각 이슈에서 `AlertBanner`로 옮깁니다.
- 화면 차이: 오류 글자가 12px에서 14px로 커집니다. "다시 연결"·"다시 저장 재시도"는 밑줄 글자에서 테두리 버튼으로 바뀝니다. 저장 상태 문구는 14px 회색 글자가 됩니다. 모서리 둥글기는 이전과 같습니다(`rounded-md` = `calc(var(--radius) - 2px)`).
- 여백 차이: 앱 위쪽 오류 상자는 이전처럼 아래 20px입니다. 앱 위쪽 저장 상태 줄에는 이전에 없던 아래 20px(`mb-5`)이 생깁니다. 편집 창의 경고·실패 상자와 저장 상태는 아래 12px(`mb-3`, 이전 상자는 20px)입니다. 기간 주소 오류는 아래 20px 대신 위 12px(`mt-3 mb-0`)를 둡니다.

## 테스트

- 추가: `frontend/src/components/alert-banner.test.tsx` 2개. 알림이 `role="alert"`이고 동작 버튼이 상자 안에 있어 누르면 불리는지, 동작이 없으면 버튼이 없고 `className`이 기본 여백을 바꾸는지 확인합니다.
- 추가: `frontend/src/workout-draft.test.tsx` 2개. 로컬 저장 공간 오류가 `AlertBanner`, 저장 완료가 `Notice`(`role="status"`)로 나오는지, 저장 실패 상자 안에 "다시 저장 재시도" 버튼이 있는지 확인합니다.
- 기존: 연결 오류 뒤 "다시 연결"로 다시 불러오는 `routing.test.tsx`가 그대로 통과합니다.
- `npm run test -w frontend -- src/components/alert-banner.test.tsx src/workout-draft.test.tsx src/routing.test.tsx src/custom-range.test.tsx`: 처음에는 새 테스트 1개가 실패했습니다(저장하면 편집 창이 닫히는데 창 안에서 상태를 찾음). 화면 전체에서 찾도록 고친 뒤 `workout-draft.test.tsx` 20 pass입니다. 나머지 세 파일은 첫 실행에서 통과했습니다.
- `npm run test -w frontend -- --maxWorkers=1 src/set-completion.test.tsx src/routine-progress.test.tsx src/body.test.tsx`: 25 pass
- `npm run typecheck -w frontend`, 바뀐 파일 eslint(`--max-warnings 0`)·prettier: 통과
- 실행하지 않은 것: PC 여유 메모리가 약 0.9GB라 프론트엔드 전체 테스트, 로컬 전체 `npm run check`, e2e는 돌리지 않았습니다. PR CI로 확인합니다.

## 변경 — fix: 1차 리뷰 보완

1차 리뷰는 필수 지적 없이 권장 5건이었습니다. 1~4는 반영했고 5는 범위 밖이라 남깁니다.

1. 라이트 테마에서 `text-destructive` 글자가 `bg-destructive/10` 위에서 약 4:1로 AA(4.5:1)에 못 미쳤습니다. legacy `.error`도 같은 색이라 회귀는 아니었지만, 글자를 `text-foreground`로 바꾸고 경고 색은 테두리·왼쪽 4px 선·바탕에만 남겼습니다.
2. 위 "화면 차이"를 실제와 맞췄습니다. 글자 크기 12px → 14px와 각 알림의 여백 변화를 적었고, 모서리는 이전과 같다고 고쳤습니다.
3. PR 본문의 사용 예시가 형제 JSX 두 개와 줄 끝 주석 때문에 그대로는 컴파일되지 않았습니다. 예시를 두 블록으로 나눴습니다.
4. 저장 실패 테스트가 `/저장/`로 상자를 찾아 저장 경고에도 맞을 수 있었습니다. 실패 문구("입력은 화면에 유지됩니다")로 찾게 바꿨고, 재시도 버튼이 `type="button"`인지와 누르면 다시 저장되는지를 더했습니다.
5. 남긴 것: 글자를 가진 채 새로 마운트되는 `role="status"`·`role="alert"`는 화면 낭독기에 따라 읽히지 않을 수 있습니다. 이전 코드도 같았고, 근본 해결은 중앙 `Notice`가 빈 영역을 항상 마운트하는 방식이라 `sirloinbh/project-standards`에서 다룰 일입니다.

- 보완 후: `npm run test -w frontend -- --maxWorkers=1 src/components/alert-banner.test.tsx src/workout-draft.test.tsx src/routing.test.tsx` 27 pass, 바뀐 파일 eslint·prettier 통과
