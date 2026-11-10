# #263 추이 그래프 점이 넓은 화면에서 타원으로 보이는 문제

## 문제

러닝 페이스 추이(`cardio/cardio-stats.tsx`)와 신체 기록 추이(`body.tsx`)의 SVG는 `preserveAspectRatio="none"`으로 가로로 늘어납니다. `<circle r="3.5">`도 함께 늘어나 1280px에서는 점이 옆으로 퍼진 타원이 됐습니다.

## 변경

- 공통 `ChartDot`(`frontend/src/chart-dot.tsx`)을 새로 두었습니다. 점을 길이 0인 `path`에 둥근 끝(`stroke-linecap: round`)과 굵기 7을 주고 `vector-effect: non-scaling-stroke`로 그립니다.
- 선 굵기는 화면 픽셀 기준이라, SVG가 늘어나도 점은 지름 7px 원으로 남습니다. 이전 `r="3.5"`와 크기가 같습니다.
- 두 그래프의 `<circle>`을 `ChartDot`으로 바꿨습니다. 선(`polyline`)과 좌표 계산, 접근성 이름, `<title>` 툴팁은 그대로입니다.

## 검사

- `npm run test -w frontend -- src/cardio src/body`: 통과
  - 페이스 그래프에 `circle`이 없고 점 2개가 non-scaling stroke를 쓰는지 확인하는 검사를 더했습니다.
  - 신체 기록 추이 점 수 검사는 `[data-slot="chart-dot"]`을 셉니다.
- 타입 검사, ESLint, Prettier: 통과
- 시각 기준선: CI에서 기준과 달라진 `journal-cardio-1280`과 `body-768`을 결과 이미지로 갱신했습니다. 두 이미지에서 점이 원으로 보이는 것을 확인했습니다. 나머지 폭은 허용 범위 안이라 그대로 둡니다.

## 리뷰

- 1차: 고칠 문제 없음. 길이 0 경로의 둥근 끝은 SVG 2 규격상 원으로 그려지고, non-scaling stroke는 늘어난 SVG에서도 화면 픽셀 기준으로 그려진다는 점을 확인했습니다.
