# #89 인바디 결과 가져오기(내보낸 파일·사진 자동 추출)

- 이슈: [#89](https://github.com/sirloinbh/workout-memo/issues/89)
- 브랜치: `feat/89-inbody-import`
  - `feat/88-routine-cycle` 위에서 시작했다. DB 변경은 없다. 앞 PR들과 같은 화면 파일을 고쳐 충돌을 피하기 위해 이어서 쌓았다.
  - #91 → #92 → #94 → #95 → #96 → 이 PR 순서로 병합해야 한다.

## 결정 — 2026-10-21

- 방법은 세 가지 모두 하기로 했다. 진행 확인 결과는 다음과 같다.
  - 내보낸 파일(CSV) 가져오기: 구현
  - 사진 자동 추출(브라우저 OCR): 구현. npm 패키지 도입은 사용자가 위험을 인지한 뒤 진행을 확인했다.
  - 사진 자동 추출(외부 AI API): 이번에는 제외했다(사용자 결정).
- 원본 사진·파일은 보관하지 않는다.
- 인바디 내보내기 형식의 실제 예시가 없다. 그래서 머리글 이름으로 열을 자동 인식하고, 못 찾은 열은 사용자가 직접 지정한다.

## npm 패키지 도입

[검증된 반복 절차](../../skills/workout-foundation/references/procedures.md) 1번을 따랐다.

- 대상: `tesseract.js@7.0.0`(frontend, `--save-exact`)
  - 게시일 2025-12-15이고, 최신이면서 14일 이상 지난 버전이다.
  - Apache-2.0, 저장소 github.com/naptha/tesseract.js, 유지관리자 4명
- 하위 의존성 12개(`npm view`·lockfile 확인)
  - tesseract.js-core 7.0.0, idb-keyval 6.3.0(2026-07-08), wasm-feature-detect 1.9.0(2026-08-11)
  - node-fetch 2.7.0(+ tr46, webidl-conversions, whatwg-url), opencollective-postinstall 2.0.3
  - bmp-js 0.1.0, is-url 1.2.4, regenerator-runtime 0.13.11, zlibjs 0.3.1
  - 모두 게시 후 14일 이상 지났다.
- 설치: `npm install --ignore-scripts --save-exact -w frontend tesseract.js@7.0.0`
- 점검
  - lockfile의 `hasInstallScript`는 기존 esbuild·fsevents 외에 `tesseract.js` 1개다. postinstall `opencollective-postinstall`은 후원 안내 문구만 출력하는 스크립트(내용 확인)이고 `--ignore-scripts`로 실행하지 않았다.
  - tesseract.js·core 파일에서 IOC 문자열(webhook.site, ngrok.io 등)은 검색되지 않았다. 워크플로 파일 변경도 없다.
- subtree lockfile: 임시 디렉터리에서 `npm install --package-lock-only --ignore-scripts --before=2026-10-07`로 `frontend/package-lock.json`을 다시 만들었다. 같은 버전으로 고정됐다.
- Docker: `docker build ./frontend` 성공
- 실행 시 네트워크
  - tesseract.js의 기본 설정은 OCR 워커·코어(wasm)·한국어/영어 언어 데이터를 jsdelivr CDN에서 내려받는다. 같은 버전(7.0.0)으로 고정된다.
  - 이미지와 인식 결과는 외부로 보내지 않는다.
  - CSP 헤더가 없어 동작에 제한은 없다. 자체 호스팅은 후속 작업이다.
- 번들: 동적 import라서 별도 청크(약 16 kB)로 분리됐다. 메인 번들 증가분은 가져오기 화면 약 8 kB다. 500 kB 초과 경고는 기존과 같다.
- 비용: 브라우저 처리라서 서버·API 비용이 없다(월 $10 예산에 영향 없음).

## 변경

- `frontend/src/inbody.ts` (신규, 순수 함수)
  - CSV 파싱: BOM, 따옴표, CRLF, 쉼표·세미콜론·탭 구분자
  - 머리글 인식: 한국어·영어 이름, 대소문자·공백·괄호 단위 무시. lb 표기 열은 kg로 연결하지 않는다.
  - 날짜: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, `YYYYMMDD`, 뒤에 시간이 붙어도 된다. 그 밖은 비워 둔다.
  - 숫자: 단위 kg·%만 떼고, 그 밖은 비워 둔다.
  - 사진 글자: 같은 줄에서 라벨 바로 뒤의 값만 쓴다. 체중조절·체지방량처럼 다른 항목은 쓰지 않는다.
- `frontend/src/inbody-import.tsx` (신규): 신체 기록 화면의 "인바디 가져오기"
  - 파일을 고르면 CSV 열 지정과 편집 가능한 미리보기를 보여 준다.
  - 공유 계약 `bodyMeasurementSchema`로 행마다 검증한다. 틀린 행은 저장 선택이 막히고 사유를 표시한다.
  - 선택한 행만 기존 `POST /api/body-measurements`로 한 건씩 저장한다. 실패한 행(예: 이미 기록한 날짜 409)은 값과 사유를 남긴다.
  - 사진: `tesseract.js`를 동적으로 불러와 `kor+eng`로 인식한다. 인식한 글자는 펼쳐 볼 수 있다.
- 서버·DB·API 계약 변경은 없다.

## 테스트

- `frontend/src/inbody.test.ts` (신규)
  - CSV 형식, 열 인식(파운드 제외), 날짜·숫자 정규화 경계
  - 빈 값 유지
  - 결과지 글자에서 라벨 값만 추출
- `frontend/src/inbody-import.test.tsx` (신규, tesseract.js는 모의)
  - CSV 미리보기, 잘못된 날짜 행 저장 막힘과 수정 후 저장, 값 비우기 → null
  - 409 행 유지
  - 열 직접 지정
  - 사진: 인식 값으로 미리보기, 읽지 못한 값은 비움. 저장 요청에는 이미지가 없고 값만 있다.
- 실제 사진 인식률은 자동 테스트하지 않았다(OCR 결과는 사진 품질에 따라 다름). 미리보기에서 사용자가 반드시 확인하게 했다.

## 검증 — 2026-10-21

- `npm run check`(Node 24.21.0, `TEST_DATABASE_URL`=로컬 전용 테스트 DB) 통과
  - 백엔드 303 pass, 0 skip
  - 프론트 109 pass
  - 워커 162, skills 4, docs 3, build 통과
- `npm run test:e2e`(같은 테스트 DB): 4 passed(320·390px 레이아웃 포함)
- `docker build ./frontend`: 성공

## 제한·후속

- 외부 AI API 추출은 제외했다. 필요하면 키 관리·비용·개인정보 범위를 정해 별도 이슈로 진행한다.
- 실제 인바디 내보내기 파일로 열 이름을 확인하지 못했다. 자동 인식이 안 되면 열을 직접 고르면 되고, 예시 파일을 받으면 이름 목록을 보강한다.
- OCR 엔진·언어 데이터 자체 호스팅(CDN 의존 제거)은 후속 작업이다.
