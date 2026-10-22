# FORM API

Express 5 + TypeScript + PostgreSQL. `DATABASE_URL` 설정 후 `npm install`, `npm run dev`. 기본 포트 3101. API 경로는 `/api/workouts`, `/api/goals`, `/api/brands`, `/api/machines`. 날짜 조회는 `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

`npm test`는 단위 테스트를 실행합니다. `TEST_DATABASE_URL`을 설정하면 테이블이 준비된 전용 DB에서 통합 테스트를 실행하고 생성한 데이터를 정리합니다. API health: `/api/health`. 오류는 서버 표준 오류에 JSON으로 기록됩니다. 외부에 DB 접속정보를 반환하지 않습니다.
