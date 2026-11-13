# FORM API

Express 5 + TypeScript + PostgreSQL. After you set `DATABASE_URL`, run `npm install` and `npm run dev`. The default port is 3101. The API paths are `/api/workouts`, `/api/goals`, `/api/brands`, and `/api/machines`. Date queries use `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

`npm test` runs the unit tests. If you set `TEST_DATABASE_URL`, the integration tests run on a dedicated DB whose tables are prepared, and clean up the data they created. API health: `/api/health`. Errors are written as JSON to the server's standard error. DB connection details are not returned to the outside.
