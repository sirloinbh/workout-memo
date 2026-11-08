# #139 비용 문서 링크를 중앙 docs/costs.md로 바꾸기

- 이슈: [#139](https://github.com/sirloinbh/workout-memo/issues/139)
- 브랜치: `feat/139-central-costs`
- 선행: project-standards#41(비용 문서 중앙 이전, 병합됨)

## 목적

앱 8개가 함께 쓰는 서버 비용 문서가 이 리포 `docs/shared-hosting-costs.md`에 있었습니다. 같은 내용과 앱별 배분 기준이 중앙 리포 [`docs/costs.md`](https://github.com/sirloinbh/project-standards/blob/main/docs/costs.md)로 옮겨져, 두 곳에 같은 문서가 있으면 금액이 바뀔 때 한쪽만 고쳐질 수 있습니다.

## 변경 — docs: 중앙 비용 문서로 연결

- `README.md`: 공유 호스팅 비용 문서 링크를 중앙 `docs/costs.md`로 바꿨습니다.
- `docs/ai-agent-project-setup.md`: "상세 비용 계산" 링크를 중앙 문서로 바꾸고, 이 리포 문서 목록에서 `docs/shared-hosting-costs.md`를 뺐습니다.
- `docs/shared-hosting-costs.md`: 지웠습니다. 내용은 중앙 문서에 있고, 지난 내용은 Git 이력에 남습니다.
- `docs/changes/`의 과거 기록은 당시 기록이라 고치지 않았습니다.
- `docs/deployment.md`의 이 앱 배포 비용(약 $7~8)은 이 앱 서버 기준이라 그대로 두었습니다.

## 테스트

- `git grep shared-hosting-costs`: `docs/changes/` 밖에서는 이 기록 외 결과 없음
- 중앙 `docs/costs.md`가 있는지 GitHub API로 확인했습니다.
- prettier(바꾼 파일), `npm run test:docs`: 통과
