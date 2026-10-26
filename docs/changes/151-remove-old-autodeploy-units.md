# #151 옛 자동 배포 systemd 파일 지우기

- 이슈: [#151](https://github.com/sirloinbh/workout-memo/issues/151)
- 브랜치: `chore/151-remove-old-autodeploy-units`

## 변경

- `deploy/workout-autodeploy.service`, `deploy/workout-autodeploy.timer`를 지웠다.
  - 첫 동기화(#143)로 들어온 중앙 관리 파일 `deploy/autodeploy.service`, `deploy/autodeploy.timer`가 대신한다.
  - `deploy/install-autodeploy.sh`는 새 파일을 같은 유닛 이름(`workout-autodeploy`)으로 설치한다.
- 서버에 설치된 유닛(`/etc/systemd/system/workout-autodeploy.*`)은 설치 때 복사한 파일이라 이 변경으로 바뀌지 않는다. `docs/deployment.md`의 `systemctl`·`journalctl` 명령도 유닛 이름이 같아 그대로다.

## 확인

- `git grep "deploy/workout-autodeploy"`: 남은 참조 없음
- 중앙 레지스트리·템플릿에도 옛 파일 이름 참조 없음
- 전체 검사는 CI로 확인한다.
