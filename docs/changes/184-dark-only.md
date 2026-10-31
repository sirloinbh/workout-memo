# #184 다크 모드 전용 적용과 화면 검사 다크 기준

- 이슈: [#184](https://github.com/sirloinbh/workout-memo/issues/184)
- 브랜치: `chore/standards-sync-7b8cf5d` (중앙 동기화 PR #186에 커밋을 더함)

## 목적

사용자가 다크 모드만 쓰기로 정했습니다(#98). 중앙 옵션 `features.darkOnly`(project-standards#354, PR #355)를 받으면 모든 화면이 다크로 바뀌므로, 앱 쪽 검사와 문서를 같은 PR에서 맞춥니다.

## 변경 — chore: 다크 전용 앱 쪽 적용

- `frontend/index.html`: `theme-color`를 `#0a0a0a` 하나로 바꿨습니다.
- `e2e/layout.spec.ts`: 저장값이 라이트여도 다크로 표시하고 화면 모드 메뉴가 없는지 확인하는 테스트를 추가했습니다.
- `e2e/__screenshots__/ui-visual.spec.ts/`: 시각 기준선 44장 전부를 CI 실행 41180999742의 `visual-baselines`로 갱신했습니다. 모든 화면이 다크로 바뀌었기 때문입니다.
- `docs/design-system.md`: 다크 전용과 그 이유를 적고, 구성 표와 규칙 5를 고쳤습니다.

## 고치지 않은 것과 이유

- `style.css`: 다크에서 깨지는 규칙을 찾지 못해 고치지 않았습니다. 탭 선택의 그림자는 다크에서 거의 보이지 않지만 문제가 되지 않습니다.
- `e2e/a11y-known-contrast.json`: 이미 비어 있어 지울 항목이 없습니다.
- 백업·종목 분석 카드의 내용이 테두리에 붙는 것은 기존 여백 문제로 보아 화면 교체 이슈(#102, #103)에 둡니다.

## 검증

- CI 실행 41180999742(동기화 커밋 기준): 실패 44건이 모두 시각 회귀, 접근성·반응형을 포함한 26건 통과. 이 axe 검사는 다크 화면에서 돌았습니다.
- 새 기준선 44장 중 10장을 직접 봤습니다: `dashboard-1280`, `workout-editor-390`, `analysis-1280`, `goals-390`, `body-768`, `routines-1280`, `machines-390`, `backup-1280`, `journal-360`, `goal-editor-1280`.
- 로컬 `npm run check`와 `npm run test:e2e`는 실행하지 않았습니다. 이 PC에서 전체 검사가 메모리 부족으로 중단된 적이 있고, 테스트 DB도 준비하지 않았습니다. 결과는 PR CI로 확인합니다.
- 1440×900 실제 브라우저 확인은 하지 않았습니다. 기준선의 가장 넓은 폭은 1280px입니다.

## 변경 — docs: 1차 리뷰 보완

- `docs/ai-agent-project-setup.md`: 8장이 새 프로젝트의 기본값이고 workout-memo는 다크 전용이라는 문장을 추가했습니다.
- 분리: 오프라인 화면 `frontend/public/offline.html`이 OS 라이트 설정을 따르는 문제는 중앙 관리 파일이라 중앙 이슈로 나눴습니다. 번호는 아래 "제한·후속"에 적습니다.
- 반영하지 않은 지적: `sonner.tsx`의 라이트 분기, `theme.ts`의 주석, `theme-toggle.tsx` 파일 존재는 중앙 관리 파일이고 다크 전용 동작에 문제가 없습니다.

## 변경 — docs: 동기화 브랜치 재생성 복구

- 작업 중 중앙 PR #362(project-standards#359)가 main에 병합돼, 동기화 봇이 이 브랜치를 `3aecccf`(project-standards@c8a4331)로 다시 만들었습니다. 앞서 더한 커밋이 원격에서 사라졌습니다(project-standards#114).
- 로컬에 남은 커밋을 새 head에 cherry-pick해 일반 push로 복구했습니다. 강제 push는 하지 않았습니다.
- 복구 전후 차이는 #362가 가져온 `std-git-writing` 스킬과 `.standards/manifest.json`뿐입니다. 시각 기준선은 다시 만들지 않았습니다.

## 변경 — docs: 리뷰 기록

- 1차 리뷰: 위 "1차 리뷰 보완"으로 반영하고, 오프라인 화면은 project-standards#363으로 분리했습니다.
- 2차 리뷰: 보완점 없음. 복구 전후 차이는 리뷰어가 대조하지 못해 작성자가 `git diff a432737 aee97c7`로 확인했습니다.

## 제한·후속

- 오프라인 화면: project-standards#363. 이 PR 병합 뒤에 진행합니다.
- 중앙 main에 새 병합이 들어가면 동기화 브랜치가 다시 만들어져 이 커밋이 사라집니다(project-standards#114). 이 PR을 병합할 때까지 중앙 main에 병합하지 않습니다.
