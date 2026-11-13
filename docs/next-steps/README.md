# 다음 작업

최종 갱신일: **2026-11-10 (Asia/Seoul)**. 작업일마다 같은 파일을 갱신한다. 실행 전에 GitHub와 워커의 실제 상태를 다시 확인한다.

## 갱신 규칙

- 주 에이전트는 일일 총정리와 함께 현재 우선순위·선행 조건·차단 원인·다음 행동을 갱신한다. 진행 상황이 달라지면 같은 날에도 수정한다.
- 날짜별 next-steps 파일을 매일 새로 만들지 않는다. 과거 상태는 [일일 기록](../daily/README.md)과 Git 이력으로 보존한다.
- 완료 항목은 현재 할 일에서 정리하고 해당 날짜의 총정리에 결과·PR·검증을 남긴다. PR 생성, CI 통과, 병합, 배포는 별개 상태로 적는다.
- 세부 실행 절차는 이 디렉토리의 문서로 연결한다. 이 문서 편집만으로 이슈가 큐에 등록되거나 워커가 실행되지는 않는다.

## 우선 처리

| 순서 | 대상                                                                                                                                                        | 현재 확인 상태                                                                                                                                                                                                                                                                                             | 다음 행동·선행 조건                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | [#105](https://github.com/sirloinbh/workout-memo/issues/105) 모바일 입력 흐름 (P2)                                                                          | 세트 카드(#232), 하단 시트·저장 버튼 고정(#237), 휴식 타이머 상단 고정·진동(#246) 병합. [#267](https://github.com/sirloinbh/workout-memo/pull/267) 390px 새 일지 흐름 e2e draft. [#268](https://github.com/sirloinbh/workout-memo/issues/268) 세트 카드 줄이기(P3) 등록. 루틴 단계별 입력은 agent3 진행 중 | e2e로 탭 수·스크롤을 확인하고 #268을 처리한다. 루틴 단계별 입력이 병합되면 아래 2·4·5를 이어서 한다                                                                      |
| 2    | [#124](https://github.com/sirloinbh/workout-memo/issues/124) 운동명 자동완성 (P2)                                                                           | 일지·목표는 [#273](https://github.com/sirloinbh/workout-memo/pull/273)로 끝남(운영 반영 확인). 종목 분석에는 입력란이 없어 대상 아님                                                                                                                                                                       | 루틴 단계별 입력 PR 병합 뒤 루틴 운동 입력에 같은 `Combobox`와 비슷한 이름 안내를 붙이고 이슈를 닫는다                                                                   |
| 3    | [#119](https://github.com/sirloinbh/workout-memo/issues/119) 활동 파일 가져오기 (P4, needs-user)                                                            | [#266](https://github.com/sirloinbh/workout-memo/pull/266) TCX·GPX 미리보기와 중복 방지 draft(agent2)                                                                                                                                                                                                      | #266을 마친다. FIT·ZIP은 사용자가 `@garmin/fitsdk`·`fflate`를 설치하고 샘플 파일을 준 뒤 진행한다                                                                        |
| 4    | [#173](https://github.com/sirloinbh/workout-memo/issues/173) 불러오는 중 표시 (P4)                                                                          | 1~3단계 병합(#250·#270·#274)                                                                                                                                                                                                                                                                               | #266 병합 뒤 유산소 기록 목록(`cardio-panel.tsx`)·저장 버튼(`cardio-form.tsx`). 루틴 폼은 agent3 PR에서 정리하고 확인 뒤 닫는다                                          |
| 5    | [#271](https://github.com/sirloinbh/workout-memo/issues/271) 임시 Checkbox 덮어쓰기 제거 (P4)                                                               | 머신 편집·인바디 미리보기는 [#272](https://github.com/sirloinbh/workout-memo/pull/272)로 끝남                                                                                                                                                                                                              | 루틴 폼(`routines.tsx`) 한 곳은 agent3 PR에서 지운다. 확인 뒤 닫는다                                                                                                     |
| 6    | [#109](https://github.com/sirloinbh/workout-memo/issues/109) PWA 설치 지원 (P4)                                                                             | manifest·아이콘·`sw.js`·`offline.html`은 이미 있다(중앙 관리 파일). 2026-11-10 사용자 결정: 새 버전 안내+[새로고침], 오프라인은 `offline.html` 유지와 저장 실패 문구 개선, 직접 작성 `sw.js` 유지, localhost 운영 빌드 1회 점검                                                                            | 결정대로 구현하고 localhost 운영 빌드로 검증해 `docs/mobile-app.md`에 기록한다. 실기기·운영 확인은 [#106](https://github.com/sirloinbh/workout-memo/issues/106) HTTPS 뒤 |
| 7    | [#107](https://github.com/sirloinbh/workout-memo/issues/107) 로그인, [#260](https://github.com/sirloinbh/workout-memo/issues/260) 휴식 타이머 Web Push (P4) | agent2 순서: #266 → #107 → #260                                                                                                                                                                                                                                                                            | #107은 `/api/` 401 처리를 서비스 워커가 캐시하지 않는 원칙과 맞춘다                                                                                                      |

## 사용자 단계

- [#106](https://github.com/sirloinbh/workout-memo/issues/106) 운영 도메인 연결과 HTTPS: PWA 설치(#109)·로그인(#107)·앱 출시의 선행 조건이다.
- [#119](https://github.com/sirloinbh/workout-memo/issues/119) FIT·ZIP 가져오기: `@garmin/fitsdk`·`fflate` 설치 명령 실행(에이전트가 확인 결과와 명령을 PR에 적음), 개인정보를 지운 가민 FIT·TCX 샘플 1~2개.
- [#120](https://github.com/sirloinbh/workout-memo/issues/120) 나이키 런 클럽: Nike 계정 설정에서 본인 데이터를 요청하고 받은 파일 형식을 알려 준다.
- [#121](https://github.com/sirloinbh/workout-memo/issues/121) 가민 자동 동기화: Garmin Connect 웹에서 Personal API 키를 만든다(만들 때 한 번만 보임).
- 로컬 브랜치 `backup/local-main-2026-11-01`은 옛 `main` 백업이다. 필요 없다고 판단하면 지운다. 이력이 달라 `git branch --delete`는 거부되므로 `-D` 승인이 필요하다.
- 이 PC에서 전체 `npm run check`가 메모리 부족으로 중단된다(2026-10-31, 2026-11-01). 로컬 검사 전에 메모리를 확보한다.
- 터치 기기 변경(#104)과 일지 편집 화면(휴식 타이머, #105 세트 카드·하단 시트), 종목 분석의 목록 → 상세(#125), 운동명 자동완성(#124)을 실제 휴대폰에서 한 번 확인한다. 지금까지는 터치 에뮬레이션과 운영 자산 조회로만 확인했다.
- 2026-10-20에 적어 둔 항목은 다시 확인하지 않았다: 로컬 DB `npm run db:migrate` 기준선, 운영 03:00 스냅샷·03:30 백업 생성.

## 후속 기능·정리

- 공통 Combobox가 중앙에 생기면([project-standards#437](https://github.com/sirloinbh/project-standards/issues/437)) 앱 전용 `components/combobox.tsx`를 바꾼다.
- 프런트 전체 테스트를 한 번에 돌리면 `routines.test.tsx`의 긴 테스트 1개가 15초 제한에 걸린다(따로 실행하면 통과). 아직 이슈가 없다.
- 공통 `Notice`의 live region이 처음부터 그려지면 화면 낭독기가 읽지 않을 수 있다(#223 리뷰). 중앙 컴포넌트라 `project-standards`에 이슈가 필요하다. 아직 이슈가 없다.
- `docs/deployment.md`에 `NODE_AUTH_TOKEN` 안내를 추가한다. 아직 이슈가 없다. main에 들어간 적 없는 초안이 로컬 브랜치 `chore/145-standards-sync-prep`(닫힌 PR #146)에 있고, 추가한 뒤 이 브랜치를 지운다. 이 브랜치도 이력상 병합되지 않아 삭제에 `-D` 승인이 필요하다.
- 공통 `Button` 등은 아직 약한 포커스 테두리(`ring/50`)를 쓴다. 앱 고유 컴포넌트는 #101에서 `ring-ring`으로 바꿨다. 중앙 컴포넌트라 `project-standards`에 이슈가 필요하다. 아직 이슈가 없다.
- 1회성 장식 색 토큰화는 아직 이슈가 없다(#66 후속).
- 일지·머신 폼의 React Hook Form 완전 전환: 초안 저장·재시도 키 구조를 먼저 분리해야 한다(#64 후속).
- 신체 기록·루틴 폼에 공유 계약 화면 검증을 적용한다(#64 후속).
- OpenAPI 응답 스키마: 응답 Zod 스키마를 먼저 정의해야 한다(#68 후속).

## 실행 경계

과거 #17·#19·#26 차단의 배경은 [복구 절차](blocked-issues-recovery.md)에 보존한다. 로컬 워커 job 상태는 2026-10-19 수동 처리 이후 그대로이므로, 워커를 재개하기 전에 PR 상태와 대조한다. 하위 저장소 동기화·AWS 배포는 별도 요청 범위이며, PR은 필수 CI 통과 후 에이전트가 병합한다(#128). 동기화 PR은 본문의 "병합 전에 확인" 항목이 있으므로 사용자에게 묻는다.
