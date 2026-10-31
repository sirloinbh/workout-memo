# 다음 작업

최종 갱신일: **2026-10-31 (Asia/Seoul)**. 작업일마다 같은 파일을 갱신한다. 실행 전에 GitHub와 워커의 실제 상태를 다시 확인한다.

## 갱신 규칙

- 주 에이전트는 일일 총정리와 함께 현재 우선순위·선행 조건·차단 원인·다음 행동을 갱신한다. 진행 상황이 달라지면 같은 날에도 수정한다.
- 날짜별 next-steps 파일을 매일 새로 만들지 않는다. 과거 상태는 [일일 기록](../daily/README.md)과 Git 이력으로 보존한다.
- 완료 항목은 현재 할 일에서 정리하고 해당 날짜의 총정리에 결과·PR·검증을 남긴다. PR 생성, CI 통과, 병합, 배포는 별개 상태로 적는다.
- 세부 실행 절차는 이 디렉토리의 문서로 연결한다. 이 문서 편집만으로 이슈가 큐에 등록되거나 워커가 실행되지는 않는다.

## 우선 처리

| 순서 | 대상                                                                                                            | 현재 확인 상태                                                                                               | 다음 행동·선행 조건                                                                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [PR #189](https://github.com/sirloinbh/workout-memo/pull/189) 중앙 동기화(vite 6.4.5, project-standards#352)    | CI 실패: `verify`, `e2e-visual`, `docker-build`. 원인은 `lock file's vite@6.4.4 does not satisfy vite@6.4.5` | lockfile을 6.4.5로 갱신해 이 PR에 커밋한다. 패키지 설치 절차라 사용자 확인이 먼저다. 커밋 후 병합 전까지 중앙 main에 병합하지 않는다(project-standards#114)                                                               |
| 2    | [#99](https://github.com/sirloinbh/workout-memo/issues/99) 공통 컴포넌트 확장 (P1)                              | 선행 #98 닫힘. 후보 중 Tabs, ToggleGroup, Switch, NumberInput, List가 없다                                   | 필요한 것만 추려 `frontend/src/components/`에 앱 고유로 만든다(중앙 `docs/design-system.md` "컴포넌트"). 화면은 교체하지 않는다                                                                                           |
| 3    | [#104](https://github.com/sirloinbh/workout-memo/issues/104) 모바일 입력·터치 (P1)                              | 하단 탭 없이 진행하기로 결정(이슈 코멘트). 구현 전                                                           | `style.css`의 작은 입력 글자(예: `.date-control input` 11px)를 모바일에서 16px 이상, 터치 대상을 44px 이상으로 고친다. 기존 `fix/104-mobile-input-touch`는 커밋 없는 옛 브랜치라 쓰지 않는다. 시각 기준선 갱신이 필요하다 |
| 4    | [project-standards#363](https://github.com/sirloinbh/project-standards/issues/363) 오프라인 화면 다크 고정 (P3) | 열림. OS가 라이트인 기기에서 `offline.html`이 흰색이다                                                       | #189 병합 뒤 착수한다. 중앙 병합이 #189 브랜치를 다시 만들기 때문이다                                                                                                                                                     |

## 사용자 단계

- 로컬 `main`이 원격과 갈라져 있다(ahead 195, behind 266). 2026-10-31에 원격 main 이력이 다시 쓰인 것을 확인했다. `git pull --ff-only`는 실패할 것이므로, 로컬 main을 어떻게 맞출지 사용자가 정한다.
- 로컬 브랜치 정리는 위 결정 뒤에 한다. 대상 후보는 [2026-10-31 총정리](../daily/2026-10-31.md)에 있다.
- [#148](https://github.com/sirloinbh/workout-memo/issues/148) npm audit: zod 4 메이저 업그레이드와 패키지 설치 승인이 필요하다. [PR #170](https://github.com/sirloinbh/workout-memo/pull/170)(Dependabot)은 CI가 실패한 상태다.
- [#140](https://github.com/sirloinbh/workout-memo/issues/140) 목표 종료일: 일요일 시작 주 규칙을 따를지, 이 앱만 예외로 둘지 정한다.
- 이 PC에서 전체 `npm run check`가 메모리 부족으로 중단된 적이 있다(2026-10-31). 로컬 검사 전에 메모리를 확보한다.
- 2026-10-20에 적어 둔 항목은 2026-10-31에 다시 확인하지 않았다: 로컬 DB `npm run db:migrate` 기준선, 운영 03:00 스냅샷·03:30 백업 생성.

## 후속 기능·정리

- P2 화면 교체: [#101](https://github.com/sirloinbh/workout-memo/issues/101), [#102](https://github.com/sirloinbh/workout-memo/issues/102), [#103](https://github.com/sirloinbh/workout-memo/issues/103)은 #99가 끝나야 한다. 백업·종목 분석 카드의 내용이 테두리에 붙는 문제도 이때 고친다.
- P2 그 외: [#105](https://github.com/sirloinbh/workout-memo/issues/105)는 #104 뒤, [#125](https://github.com/sirloinbh/workout-memo/issues/125)는 #102와 함께, [#124](https://github.com/sirloinbh/workout-memo/issues/124)는 #99의 Combobox 여부를 본 뒤 진행한다.
- 페이지 본문 버튼·입력을 공통 컴포넌트로 옮기는 일은 위 화면 교체에서 한다. 1회성 장식 색 토큰화는 아직 이슈가 없다(#66 후속).
- 일지·머신 폼의 React Hook Form 완전 전환: 초안 저장·재시도 키 구조를 먼저 분리해야 한다(#64 후속).
- 신체 기록·루틴 폼에 공유 계약 화면 검증을 적용한다(#64 후속).
- OpenAPI 응답 스키마: 응답 Zod 스키마를 먼저 정의해야 한다(#68 후속).

## 실행 경계

과거 #17·#19·#26 차단의 배경은 [복구 절차](blocked-issues-recovery.md)에 보존한다. 로컬 워커 job 상태는 2026-10-19 수동 처리 이후 그대로이므로, 워커를 재개하기 전에 PR 상태와 대조한다. 하위 저장소 동기화·AWS 배포는 별도 요청 범위이며, PR은 필수 CI 통과 후 에이전트가 병합한다(#128). 동기화 PR은 본문의 "병합 전에 확인" 항목이 있으므로 사용자에게 묻는다.
