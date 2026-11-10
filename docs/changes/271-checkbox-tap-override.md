# #271 앱의 임시 Checkbox 누름 영역 덮어쓰기 제거

## 문제

공통 Checkbox의 터치 누름 영역은 42px이었습니다. `::after`가 1px 테두리 안쪽에서 `-inset-3.5`로 잡혔기 때문입니다. 그래서 앱은 머신 편집과 인바디 미리보기에서 `pointer-coarse:after:-inset-[15px]`로 덮어써 44px을 맞췄습니다. #258(중앙 project-standards#415·#433)로 공통 Checkbox가 같은 값을 갖게 되어 이 덮어쓰기는 필요 없습니다.

## 변경

- `app.tsx` 머신 편집 "단관절 운동" 체크박스와 `inbody-import.tsx` 행 저장 체크박스에서 `pointer-coarse:after:-inset-[15px]`를 지우고 주석을 고쳤습니다.
- `pointer-coarse:min-h-4 pointer-coarse:min-w-4`는 그대로 둡니다. 옛 화면의 "모든 버튼 44px" 규칙이 상자를 키우지 않게 막는 값입니다.
- 루틴 폼(`routines.tsx`)의 같은 덮어쓰기는 agent3의 루틴 단계별 입력 작업과 겹쳐 그 PR 뒤에 지웁니다.

## 검사

- `e2e/ui-touch.spec.ts`가 체크박스 `::after` 누름 영역 44px 이상과 상자 24px 이하를 검사합니다(CI).
- `npm run test -w frontend -- src/inbody src/machine src/components/ui/checkbox`: 통과(4파일 14개)
