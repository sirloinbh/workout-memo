# project-standards#357 cn() 글자 스타일 수정에 맞춘 시각 기준선 갱신

## 변경

- `e2e/__screenshots__/ui-visual.spec.ts/`: 768px, 1280px 기준선 22장을 CI `visual-baselines` 아티팩트로 갱신했습니다.

## 이유

- 중앙의 `cn()` 수정으로 왼쪽 메뉴의 현재 항목 글자가 다른 항목과 같은 `text-body-sm` 크기로 돌아왔습니다.
- 예전에는 `text-sidebar-accent-foreground`가 글자 크기를 지워 현재 항목만 더 크게 보였습니다.

## 확인

- `dashboard-1280` 전후 화면을 비교해 메뉴 글자 크기만 달라진 것을 확인했습니다. 나머지 21장은 픽셀 차이 비율(1% 이하)과 CI 결과로 확인했습니다.
- 360px, 390px 기준선 22장은 그대로입니다.
